"""Moteur M2 — Bilan d'opération promoteur (version recalibrée session 2).

Fidèle à la structure du Modèle de bilan.xls (Orly Ecohome, BILAN CAHP-94)
auditée dans docs/audit-fichiers-sources.md.

Deux sous-bilans : part BRS (accession sociale) + part PLI/Béguinage (locatif).
Pour chaque poste, une valeur BRS et une valeur PLI, calculées à partir d'un
ratio × une assiette (SHAB/SDP/forfait/% d'une autre ligne) ou saisies en dur.

Rubriques (ordre canonique) :
  1. FONCIER (acquisition, taxes, VRD, préparation terrain, raccordements...)
  2. TRAVAUX BÂTIMENT (TCE, salle commune, aléas)
  3. HONORAIRES BÂTIMENT (MOE, BET, labels, assurances)
  4. COMMERCIALISATION
  5. GESTION ET MOD (OFS, SAV, honoraires de gestion)
  6. FRAIS FINANCIERS

La différence structurelle avec la V0 session 1 : séparation BRS / PLI dans
toutes les lignes (le béguinage n'est pas viable sans subvention institutionnelle,
cf. audit) et marge pré-subvention vs post-subvention affichées côte-à-côte.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal, Optional

Severity = Literal["info", "attention", "critique"]
Rubrique = Literal[
    "FONCIER",
    "TRAVAUX BÂTIMENT",
    "HONORAIRES BÂTIMENT",
    "COMMERCIALISATION",
    "GESTION ET MOD",
    "FRAIS FINANCIERS",
]

RUBRIQUE_ORDER: list[Rubrique] = [
    "FONCIER",
    "TRAVAUX BÂTIMENT",
    "HONORAIRES BÂTIMENT",
    "COMMERCIALISATION",
    "GESTION ET MOD",
    "FRAIS FINANCIERS",
]


# -----------------------------------------------------------------------------
# Entrées
# -----------------------------------------------------------------------------

@dataclass
class LigneSaisie:
    """Une ligne de bilan avec sa valeur BRS et sa valeur PLI (en € HT)."""
    rubrique: Rubrique
    poste: str
    brs: float = 0.0
    pli: float = 0.0
    ratio_commentaire: str = ""  # ex: "2150 €/m² SDP" — pour mémo


@dataclass
class Vente:
    """Prix de vente HT d'une sous-opération (BRS ou PLI)."""
    volet: Literal["BRS", "PLI"]
    prix_vente_ht: float
    nb_logements: int
    shab_m2: float
    sdp_m2: float


@dataclass
class SubventionGlobale:
    """Subvention affectée à un volet (ex: 800k AGIRC pour béguinage, 160k Action Logement pour BRS)."""
    volet: Literal["BRS", "PLI"]
    source: str  # "Action Logement", "AGIRC/ARRCO/CNAV", "ANRU espaces communs", etc.
    montant: float


@dataclass
class BilanInput:
    operation_code: str
    nom: str
    commune: str
    zone_brs: str
    livraison_cible: str

    lignes: list[LigneSaisie] = field(default_factory=list)
    ventes: list[Vente] = field(default_factory=list)
    subventions: list[SubventionGlobale] = field(default_factory=list)


# -----------------------------------------------------------------------------
# Sorties
# -----------------------------------------------------------------------------

@dataclass
class LigneResult:
    rubrique: Rubrique
    poste: str
    brs: float
    pli: float
    total: float
    ratio_commentaire: str = ""


@dataclass
class TotalRubrique:
    rubrique: Rubrique
    brs: float
    pli: float
    total: float


@dataclass
class SousBilan:
    """Récap par volet (BRS ou PLI/Béguinage)."""
    volet: Literal["BRS", "PLI"]
    nb_logements: int
    shab_m2: float
    sdp_m2: float
    prix_revient_ht: float
    prix_vente_ht: float
    marge_brute: float
    subventions: float
    marge_nette: float
    marge_nette_pct: float
    pr_m2_shab: float


@dataclass
class Alerte:
    severity: Severity
    titre: str
    detail: str


@dataclass
class BilanResult:
    operation_code: str
    nom: str
    commune: str
    livraison_cible: str

    # Agrégats globaux
    nb_logements_total: int
    nb_logements_brs: int
    nb_logements_pli: int
    shab_total_m2: float
    sdp_total_m2: float
    prix_revient_ht_total: float
    prix_revient_m2_shab: float
    prix_vente_ht_total: float
    subventions_totales: float
    marge_brute_totale: float  # hors subventions
    marge_nette_totale: float  # avec subventions
    marge_nette_pct: float
    cash_flow_apport_quasi_fp: float  # proxy du besoin en quasi-FP

    # Détail
    sous_bilans: list[SousBilan]
    lignes: list[LigneResult]
    totaux_rubriques: list[TotalRubrique]
    subventions_detail: list[dict]
    alertes: list[Alerte]

    def to_dict(self) -> dict:
        return asdict(self)


# -----------------------------------------------------------------------------
# Moteur
# -----------------------------------------------------------------------------

def calcul_bilan_operation(inp: BilanInput) -> BilanResult:
    # Totaux par rubrique
    totaux_rubriques: dict[Rubrique, TotalRubrique] = {
        r: TotalRubrique(rubrique=r, brs=0.0, pli=0.0, total=0.0)
        for r in RUBRIQUE_ORDER
    }
    lignes_result: list[LigneResult] = []
    for lg in inp.lignes:
        total = lg.brs + lg.pli
        lignes_result.append(LigneResult(
            rubrique=lg.rubrique,
            poste=lg.poste,
            brs=round(lg.brs, 2),
            pli=round(lg.pli, 2),
            total=round(total, 2),
            ratio_commentaire=lg.ratio_commentaire,
        ))
        tr = totaux_rubriques[lg.rubrique]
        tr.brs += lg.brs
        tr.pli += lg.pli
        tr.total += total
    for tr in totaux_rubriques.values():
        tr.brs = round(tr.brs, 2)
        tr.pli = round(tr.pli, 2)
        tr.total = round(tr.total, 2)

    # Sous-bilans
    sous_bilans: list[SousBilan] = []
    for v in inp.ventes:
        pr_volet = sum(
            tr.brs if v.volet == "BRS" else tr.pli for tr in totaux_rubriques.values()
        )
        subv_volet = sum(s.montant for s in inp.subventions if s.volet == v.volet)
        marge_brute = v.prix_vente_ht - pr_volet
        marge_nette = marge_brute + subv_volet
        pct = round(marge_nette / pr_volet * 100, 2) if pr_volet else 0.0
        pr_m2 = round(pr_volet / v.shab_m2, 2) if v.shab_m2 else 0.0
        sous_bilans.append(SousBilan(
            volet=v.volet,
            nb_logements=v.nb_logements,
            shab_m2=round(v.shab_m2, 2),
            sdp_m2=round(v.sdp_m2, 2),
            prix_revient_ht=round(pr_volet, 2),
            prix_vente_ht=round(v.prix_vente_ht, 2),
            marge_brute=round(marge_brute, 2),
            subventions=round(subv_volet, 2),
            marge_nette=round(marge_nette, 2),
            marge_nette_pct=pct,
            pr_m2_shab=pr_m2,
        ))

    # Agrégats globaux
    pr_total = sum(sb.prix_revient_ht for sb in sous_bilans)
    pv_total = sum(sb.prix_vente_ht for sb in sous_bilans)
    subv_total = sum(sb.subventions for sb in sous_bilans)
    marge_brute = pv_total - pr_total
    marge_nette = marge_brute + subv_total
    marge_pct = round(marge_nette / pr_total * 100, 2) if pr_total else 0.0

    nb_total = sum(sb.nb_logements for sb in sous_bilans)
    nb_brs = sum(sb.nb_logements for sb in sous_bilans if sb.volet == "BRS")
    nb_pli = sum(sb.nb_logements for sb in sous_bilans if sb.volet == "PLI")
    shab_total = sum(sb.shab_m2 for sb in sous_bilans)
    sdp_total = sum(sb.sdp_m2 for sb in sous_bilans)
    pr_m2_shab = round(pr_total / shab_total, 2) if shab_total else 0.0

    # Proxy quasi-fonds propres : total FONCIER + 30 % premiers travaux (démarrage)
    foncier = totaux_rubriques["FONCIER"].total
    travaux_debut = totaux_rubriques["TRAVAUX BÂTIMENT"].total * 0.30
    cash_flow_qfp = -(foncier + travaux_debut)

    # Alertes
    alertes = _calcul_alertes(sous_bilans, marge_nette, marge_pct, pr_m2_shab)

    return BilanResult(
        operation_code=inp.operation_code,
        nom=inp.nom,
        commune=inp.commune,
        livraison_cible=inp.livraison_cible,
        nb_logements_total=nb_total,
        nb_logements_brs=nb_brs,
        nb_logements_pli=nb_pli,
        shab_total_m2=round(shab_total, 2),
        sdp_total_m2=round(sdp_total, 2),
        prix_revient_ht_total=round(pr_total, 2),
        prix_revient_m2_shab=pr_m2_shab,
        prix_vente_ht_total=round(pv_total, 2),
        subventions_totales=round(subv_total, 2),
        marge_brute_totale=round(marge_brute, 2),
        marge_nette_totale=round(marge_nette, 2),
        marge_nette_pct=marge_pct,
        cash_flow_apport_quasi_fp=round(cash_flow_qfp, 2),
        sous_bilans=sous_bilans,
        lignes=lignes_result,
        totaux_rubriques=list(totaux_rubriques.values()),
        subventions_detail=[asdict(s) for s in inp.subventions],
        alertes=alertes,
    )


def _calcul_alertes(
    sous_bilans: list[SousBilan],
    marge_nette_totale: float,
    marge_pct: float,
    pr_m2_shab: float,
) -> list[Alerte]:
    alertes: list[Alerte] = []

    # 1. Marge brute (pré-subvention) négative sur un volet
    for sb in sous_bilans:
        if sb.marge_brute < 0:
            alertes.append(Alerte(
                "critique",
                f"Volet {sb.volet} non viable sans subvention",
                f"Marge brute {sb.volet} = {sb.marge_brute:,.0f} € (déficit structurel). "
                f"L'équilibre dépend des {sb.subventions:,.0f} € de subventions institutionnelles.".replace(",", " "),
            ))

    # 2. Marge nette totale négative
    if marge_nette_totale < 0:
        alertes.append(Alerte(
            "critique",
            "Marge nette totale négative",
            f"Résultat prévisionnel {marge_nette_totale:,.0f} €. Opération non viable même avec subventions.".replace(",", " "),
        ))
    elif marge_pct < 3:
        alertes.append(Alerte(
            "attention",
            "Marge nette faible",
            f"Marge nette à {marge_pct} % du prix de revient — seuil recommandé 3 à 5 %.",
        ))
    elif marge_pct > 15:
        alertes.append(Alerte(
            "attention",
            "Marge nette atypique",
            f"Marge nette à {marge_pct} % — vérifier qu'il ne manque pas de postes dans la ventilation.",
        ))
    else:
        alertes.append(Alerte(
            "info",
            "Marge nette conforme",
            f"Marge nette à {marge_pct} % du prix de revient.",
        ))

    # 3. Prix de revient / m² inhabituel
    if pr_m2_shab > 4000:
        alertes.append(Alerte(
            "attention",
            "Prix de revient élevé au m²",
            f"PR = {pr_m2_shab:,.0f} €/m² SHAB — ratio supérieur aux standards IDF (2800-3800 €).".replace(",", " "),
        ))
    elif pr_m2_shab < 2500 and pr_m2_shab > 0:
        alertes.append(Alerte(
            "attention",
            "Prix de revient faible au m²",
            f"PR = {pr_m2_shab:,.0f} €/m² SHAB — suspect, vérifier la ventilation.".replace(",", " "),
        ))

    # 4. Dépendance aux subventions
    total_subv = sum(sb.subventions for sb in sous_bilans)
    total_pr = sum(sb.prix_revient_ht for sb in sous_bilans)
    if total_pr and total_subv / total_pr > 0.15:
        alertes.append(Alerte(
            "attention",
            "Forte dépendance aux subventions",
            f"Subventions = {total_subv / total_pr * 100:.1f} % du prix de revient. "
            f"Risque élevé si une subvention n'est pas obtenue.",
        ))

    return alertes
