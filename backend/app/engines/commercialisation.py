"""Moteur M4 — Qualification ménage BRS.

Reproduit la logique du Tableau de commercialisation 03.02.2026.xlsx et du
fichier BRS AMENAGE CALCUL SUBVENTION MENAGES.xlsx auditée dans
docs/audit-fichiers-sources.md.

Pipeline :
  1. UC (OECD modifiée) : 1er adulte=1, autre adulte=0,5, enfant<14=0,3, ≥14=0,5
  2. Revenu disponible annuel = activités + patrimoine + prestations sociales
  3. Revenu dispo / UC → classement dans un décile FiLoSoFi (table commune ou défaut Saint-Denis 2021)
  4. Décote BRS par typologie et décile → prix de vente ajusté
  5. Subvention ANRU par typologie et décile → prix net
  6. Prix net - apport = capital à emprunter
  7. Plan de financement : PTZ (durée Dptz, taux 0 %) + prêt complémentaire (durée Dpc, taux Tpc)
  8. Mensualité totale = PMT(PTZ) + PMT(PC)
  9. Taux d'effort = mensualité × 12 / revenu annuel
 10. Reste à vivre par UC = (revenu annuel - mensualité × 12) / UC / 12 / 30 (jour)
 11. Verdict : éligible / limite / non éligible selon seuils (33 % effort, 7 €/UC/jour reste)

Formules financières : numpy-financial (PMT, IPMT, PPMT, FV).
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal, Optional

try:
    import numpy_financial as npf
except ImportError:  # fallback pur-python si npf absent
    npf = None


Typologie = Literal["T2", "T3", "T4"]
Decile = Literal["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10+"]
Verdict = Literal["eligible", "limite", "non_eligible"]


# -----------------------------------------------------------------------------
# Référentiels par défaut (Saint-Denis 2021 — audit DOHIS)
# -----------------------------------------------------------------------------

# Déciles de revenu disponible annuel € (par UC) — ensemble des ménages Saint-Denis 2021
# Les bornes sont les PLAFONDS DU DÉCILE (inclusif)
DECILES_SAINT_DENIS = [
    ("D1", 7_970),
    ("D2", 10_540),
    ("D3", 12_610),
    ("D4", 14_540),
    ("D5", 16_620),   # médiane
    ("D6", 18_980),
    ("D7", 21_920),
    ("D8", 25_920),
    ("D9", 32_240),
    # au-delà : D10+
]

# Table UC (OECD modifiée)
UC_1ER_ADULTE = 1.0
UC_AUTRE_ADULTE = 0.5
UC_ENFANT_MOINS_14 = 0.3
UC_ENFANT_14_PLUS = 0.5

# Décote BRS par décile (en %) — valide tous typologies
DECOTE_BY_DECILE_PCT = {
    "D1": 15.0, "D2": 15.0, "D3": 15.0, "D4": 15.0,  # D3-4 = -15%
    "D5": 8.0, "D6": 8.0,                             # D5-6 = -8%
    "D7": 3.0, "D8": 3.0, "D9": 3.0, "D10+": 3.0,     # D7-9 = -3%
}

# Subvention ANRU moyenne par décile × typologie (€) — Orly audit
SUBVENTION_ANRU_BY_DECILE_TYPO = {
    "D1": {"T2": 27_100, "T3": 40_700, "T4": 48_700},
    "D2": {"T2": 27_100, "T3": 40_700, "T4": 48_700},
    "D3": {"T2": 27_100, "T3": 40_700, "T4": 48_700},
    "D4": {"T2": 27_100, "T3": 40_700, "T4": 48_700},
    "D5": {"T2": 14_500, "T3": 21_700, "T4": 26_000},
    "D6": {"T2": 14_500, "T3": 21_700, "T4": 26_000},
    "D7": {"T2": 5_500, "T3": 8_200, "T4": 9_600},
    "D8": {"T2": 5_500, "T3": 8_200, "T4": 9_600},
    "D9": {"T2": 5_500, "T3": 8_200, "T4": 9_600},
    "D10+": {"T2": 0, "T3": 0, "T4": 0},  # au-delà, non éligible subvention
}

# Prix de vente de base BRS par typologie (€ TTC) — Orly audit
PV_BASE_BY_TYPO = {
    "T2": 181_000,
    "T3": 271_600,
    "T4": 325_000,
}

# Paramètres financement par défaut
DUREE_PTZ_ANS_DEFAULT = 25
TAUX_PTZ_PCT_DEFAULT = 0.0
DUREE_PC_ANS_DEFAULT = 25
TAUX_PC_PCT_DEFAULT = 3.80  # taux PLS courant 2026
PART_PTZ_PCT_DEFAULT = 40.0  # 40 % PTZ, 60 % PC

# Seuils de qualification
TAUX_EFFORT_LIMITE_PCT = 30.0
TAUX_EFFORT_MAX_PCT = 33.0
RESTE_A_VIVRE_SEUIL_UC_JOUR = 7.0  # € / UC / jour


# -----------------------------------------------------------------------------
# Entrée / sortie
# -----------------------------------------------------------------------------

@dataclass
class CompositionFamille:
    adultes: int = 1  # nombre total d'adultes (18+)
    enfants_moins_14: int = 0
    enfants_14_plus: int = 0


@dataclass
class MenageInput:
    reference: str
    typologie_logement: Typologie
    composition: CompositionFamille
    revenu_activites_annuel: float
    revenus_patrimoine_annuel: float
    prestations_sociales_annuel: float
    apport: float
    zone: str = "Saint-Denis"  # référence FiLoSoFi

    # Overrides optionnels pour simulation financement
    duree_ptz_ans: int = DUREE_PTZ_ANS_DEFAULT
    taux_ptz_pct: float = TAUX_PTZ_PCT_DEFAULT
    duree_pc_ans: int = DUREE_PC_ANS_DEFAULT
    taux_pc_pct: float = TAUX_PC_PCT_DEFAULT
    part_ptz_pct: float = PART_PTZ_PCT_DEFAULT


@dataclass
class EtapeCalcul:
    label: str
    valeur: float | str
    unite: str = ""
    note: str = ""


@dataclass
class QualificationResult:
    reference: str
    typologie: Typologie
    verdict: Verdict
    motifs: list[str]

    # Pipeline
    uc: float
    revenu_disponible_annuel: float
    revenu_disponible_mensuel: float
    revenu_par_uc_annuel: float
    decile: Decile
    decote_pct: float
    prix_vente_base: float
    prix_vente_apres_decote: float
    subvention_anru: float
    prix_net_a_financer: float
    apport: float
    capital_emprunte: float

    montant_ptz: float
    duree_ptz_ans: int
    mensualite_ptz: float

    montant_pc: float
    duree_pc_ans: int
    taux_pc_pct: float
    mensualite_pc: float

    mensualite_totale: float
    taux_effort_pct: float
    reste_a_vivre_mensuel: float
    reste_a_vivre_par_uc_jour: float

    etapes: list[EtapeCalcul]

    def to_dict(self) -> dict:
        return asdict(self)


# -----------------------------------------------------------------------------
# Fonctions pures
# -----------------------------------------------------------------------------

def calcul_uc(c: CompositionFamille) -> float:
    """UC OECD modifiée."""
    uc = UC_1ER_ADULTE
    uc += max(0, c.adultes - 1) * UC_AUTRE_ADULTE
    uc += c.enfants_moins_14 * UC_ENFANT_MOINS_14
    uc += c.enfants_14_plus * UC_ENFANT_14_PLUS
    return round(uc, 2)


def classer_decile(revenu_par_uc_annuel: float, table=DECILES_SAINT_DENIS) -> Decile:
    for name, plafond in table:
        if revenu_par_uc_annuel <= plafond:
            return name  # type: ignore[return-value]
    return "D10+"


def _pmt(montant: float, taux_annuel_pct: float, duree_ans: int) -> float:
    """Mensualité de prêt amortissable (annuités constantes)."""
    if duree_ans <= 0 or montant <= 0:
        return 0.0
    n = duree_ans * 12
    if taux_annuel_pct == 0:
        return montant / n
    r = taux_annuel_pct / 100 / 12
    if npf:
        return float(-npf.pmt(r, n, montant))
    # fallback pur Python
    return montant * r / (1 - (1 + r) ** -n)


def calcul_qualification(inp: MenageInput) -> QualificationResult:
    etapes: list[EtapeCalcul] = []

    # 1. UC
    uc = calcul_uc(inp.composition)
    etapes.append(EtapeCalcul("UC OECD modifiée", uc, "UC",
                              f"1 adulte={UC_1ER_ADULTE}, autre adulte={UC_AUTRE_ADULTE}, "
                              f"<14 ans={UC_ENFANT_MOINS_14}, ≥14 ans={UC_ENFANT_14_PLUS}"))

    # 2. Revenu disponible
    revenu_an = inp.revenu_activites_annuel + inp.revenus_patrimoine_annuel + inp.prestations_sociales_annuel
    etapes.append(EtapeCalcul("Revenu disponible annuel", revenu_an, "€",
                              "activités + patrimoine + prestations sociales"))

    revenu_par_uc = round(revenu_an / uc, 2) if uc else 0.0
    etapes.append(EtapeCalcul("Revenu disponible par UC", revenu_par_uc, "€/an"))

    # 3. Décile
    decile = classer_decile(revenu_par_uc)
    etapes.append(EtapeCalcul("Décile FiLoSoFi", decile, "",
                              f"Table {inp.zone} 2021 (ensemble des ménages)"))

    # 4. Décote et prix après décote
    decote_pct = DECOTE_BY_DECILE_PCT.get(decile, 0.0)
    pv_base = PV_BASE_BY_TYPO.get(inp.typologie_logement, 0)
    pv_apres_decote = pv_base * (1 - decote_pct / 100)
    etapes.append(EtapeCalcul(f"PV base {inp.typologie_logement}", pv_base, "€"))
    etapes.append(EtapeCalcul(f"Décote BRS décile {decile}", decote_pct, "%"))
    etapes.append(EtapeCalcul("Prix de vente après décote", round(pv_apres_decote), "€"))

    # 5. Subvention ANRU
    subv = SUBVENTION_ANRU_BY_DECILE_TYPO.get(decile, {}).get(inp.typologie_logement, 0)
    etapes.append(EtapeCalcul(f"Subvention ANRU ({decile}, {inp.typologie_logement})", subv, "€"))

    # 6. Prix net
    prix_net = pv_apres_decote - subv
    etapes.append(EtapeCalcul("Prix net à financer", round(prix_net), "€"))

    # 7. Capital emprunté
    capital = max(0.0, prix_net - inp.apport)
    etapes.append(EtapeCalcul("Apport personnel", inp.apport, "€"))
    etapes.append(EtapeCalcul("Capital à emprunter", round(capital), "€"))

    # 8. Plan de financement PTZ + PC
    montant_ptz = capital * inp.part_ptz_pct / 100
    montant_pc = capital - montant_ptz
    mens_ptz = _pmt(montant_ptz, inp.taux_ptz_pct, inp.duree_ptz_ans)
    mens_pc = _pmt(montant_pc, inp.taux_pc_pct, inp.duree_pc_ans)
    mens_total = mens_ptz + mens_pc

    etapes.append(EtapeCalcul(f"Montant PTZ ({inp.part_ptz_pct}% capital)", round(montant_ptz), "€",
                              f"durée {inp.duree_ptz_ans} ans, taux {inp.taux_ptz_pct} %"))
    etapes.append(EtapeCalcul("Mensualité PTZ", round(mens_ptz, 2), "€/mois"))
    etapes.append(EtapeCalcul("Montant prêt complémentaire", round(montant_pc), "€",
                              f"durée {inp.duree_pc_ans} ans, taux {inp.taux_pc_pct} %"))
    etapes.append(EtapeCalcul("Mensualité prêt complémentaire", round(mens_pc, 2), "€/mois"))
    etapes.append(EtapeCalcul("Mensualité totale", round(mens_total, 2), "€/mois"))

    # 9. Taux d'effort
    revenu_mensuel = revenu_an / 12
    taux_effort = (mens_total * 12 / revenu_an * 100) if revenu_an else 0.0
    etapes.append(EtapeCalcul("Taux d'effort", round(taux_effort, 2), "%",
                              f"seuil limite {TAUX_EFFORT_LIMITE_PCT} %, max {TAUX_EFFORT_MAX_PCT} %"))

    # 10. Reste à vivre
    rav_mensuel = max(0.0, revenu_mensuel - mens_total)
    rav_uc_jour = (rav_mensuel / uc / 30) if uc else 0.0
    etapes.append(EtapeCalcul("Reste à vivre mensuel", round(rav_mensuel, 2), "€/mois"))
    etapes.append(EtapeCalcul("Reste à vivre par UC et par jour", round(rav_uc_jour, 2), "€/UC/j",
                              f"seuil minimal {RESTE_A_VIVRE_SEUIL_UC_JOUR} €/UC/j"))

    # 11. Verdict
    motifs: list[str] = []
    if taux_effort > TAUX_EFFORT_MAX_PCT:
        motifs.append(f"Taux d'effort {taux_effort:.1f} % > seuil max {TAUX_EFFORT_MAX_PCT} %")
    elif taux_effort > TAUX_EFFORT_LIMITE_PCT:
        motifs.append(f"Taux d'effort {taux_effort:.1f} % entre {TAUX_EFFORT_LIMITE_PCT} et {TAUX_EFFORT_MAX_PCT} %")
    if rav_uc_jour < RESTE_A_VIVRE_SEUIL_UC_JOUR:
        motifs.append(f"Reste à vivre {rav_uc_jour:.1f} €/UC/j < seuil {RESTE_A_VIVRE_SEUIL_UC_JOUR} €")
    if decile == "D10+":
        motifs.append("Revenus > plafond D9 — non éligible BRS")
    if capital == 0:
        motifs.append("Apport suffisant, pas d'emprunt nécessaire")

    if decile == "D10+" or taux_effort > TAUX_EFFORT_MAX_PCT or rav_uc_jour < RESTE_A_VIVRE_SEUIL_UC_JOUR:
        verdict: Verdict = "non_eligible"
    elif taux_effort > TAUX_EFFORT_LIMITE_PCT or rav_uc_jour < RESTE_A_VIVRE_SEUIL_UC_JOUR * 1.3:
        verdict = "limite"
    else:
        verdict = "eligible"
        if not motifs:
            motifs.append("Taux d'effort et reste à vivre dans les cibles")

    return QualificationResult(
        reference=inp.reference,
        typologie=inp.typologie_logement,
        verdict=verdict,
        motifs=motifs,
        uc=uc,
        revenu_disponible_annuel=round(revenu_an, 2),
        revenu_disponible_mensuel=round(revenu_mensuel, 2),
        revenu_par_uc_annuel=revenu_par_uc,
        decile=decile,
        decote_pct=decote_pct,
        prix_vente_base=float(pv_base),
        prix_vente_apres_decote=round(pv_apres_decote, 2),
        subvention_anru=float(subv),
        prix_net_a_financer=round(prix_net, 2),
        apport=float(inp.apport),
        capital_emprunte=round(capital, 2),
        montant_ptz=round(montant_ptz, 2),
        duree_ptz_ans=inp.duree_ptz_ans,
        mensualite_ptz=round(mens_ptz, 2),
        montant_pc=round(montant_pc, 2),
        duree_pc_ans=inp.duree_pc_ans,
        taux_pc_pct=inp.taux_pc_pct,
        mensualite_pc=round(mens_pc, 2),
        mensualite_totale=round(mens_total, 2),
        taux_effort_pct=round(taux_effort, 2),
        reste_a_vivre_mensuel=round(rav_mensuel, 2),
        reste_a_vivre_par_uc_jour=round(rav_uc_jour, 2),
        etapes=etapes,
    )
