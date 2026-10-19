"""Simulateur d'opération — 8 onglets (cahier des charges du 14/10/2026).

Fonction pure : ``calculer(data, bareme) -> dict``. Aucune I/O.

Reprend la logique des modèles Excel du client (Hypothèses de simulation 2,
Calcul des loyers, Prix de revient détaillé, Plan de financement PLAI/PLUS/PLS/PLI/BRS,
Bilan d'opération, Exploitation locative, Synthèse, Tableau des réservataires)
en corrigeant les anomalies relevées dans ces modèles :

- le total du prix de revient additionne bien toutes les rubriques ;
- la ligne de contrôle compare la somme réelle des ressources au prix de revient ;
- une surface annexe vide vaut 0 m² (Excel MIN() ignorait la cellule vide → 4 m² offerts) ;
- la synthèse associe chaque produit à ses propres chiffres ;
- le total des emprunts inclut tous les prêts (CNAV, Action Logement, complémentaires…).
"""
from __future__ import annotations

import copy
import uuid
from datetime import date
from typing import Any

import numpy_financial as npf

PRODUITS = ["PLAI", "PLUS", "PLS", "PLI", "BRS"]
LOCATIFS = ["PLAI", "PLUS", "PLS", "PLI"]
EXONERES_TFPB = ["PLAI", "PLUS", "PLS"]  # PLI assujetti dès l'année 1 (note Hypothèses)
TYPOLOGIES = ["T1", "T2", "T2 bis", "T3", "T4", "T5"]
RUBRIQUES = [
    "FONCIER",
    "TRAVAUX BÂTIMENT",
    "HONORAIRES BÂTIMENT",
    "COMMERCIALISATION",
    "GESTION ET MOD",
    "FRAIS FINANCIERS",
]
MAX_LIGNES_SUPPLEMENTAIRES = 5
MAX_FINANCEMENTS_COMPLEMENTAIRES = 5
ZONES_123 = ["Z1bis", "Z1", "Z2", "Z3"]
ZONES_ABC = ["Abis", "A", "B1", "B2", "C"]

CATEGORIES_RESERVATAIRES = [
    "État – publics prioritaires",
    "État – agents publics",
    "Action Logement",
    "Commune",
    "EPCI",
    "Département",
    "Région",
    "Autre réservataire",
    "Non réservé (bailleur)",
]
STATUTS_RESERVATION = ["Réservé", "Attribué", "Restitué au bailleur", "Vacant"]

# Postes du « Prix de revient détaillé » (modèle client), par rubrique.
LIGNES_PR_DEFAUT: list[tuple[str, str, str]] = [
    ("fon_acquisition", "FONCIER", "Acquisition foncier"),
    ("fon_preparation", "FONCIER", "Préparation terrain"),
    ("fon_taxes", "FONCIER", "Taxes urbanisme (aménagement, foncière)"),
    ("fon_vrd", "FONCIER", "VRD"),
    ("trv_tce", "TRAVAUX BÂTIMENT", "Entreprise générale TCE"),
    ("trv_salle", "TRAVAUX BÂTIMENT", "Salle commune"),
    ("trv_aleas", "TRAVAUX BÂTIMENT", "Aléas travaux"),
    ("hon_moe", "HONORAIRES BÂTIMENT", "Maîtrise d'œuvre"),
    ("hon_opc", "HONORAIRES BÂTIMENT", "Organisation pilotage coordination (OPC)"),
    ("hon_bct", "HONORAIRES BÂTIMENT", "Bureau de contrôle"),
    ("hon_sps", "HONORAIRES BÂTIMENT", "Coordination sécurité SPS"),
    ("hon_labels", "HONORAIRES BÂTIMENT", "Labels"),
    ("hon_amo", "HONORAIRES BÂTIMENT", "AMO faisabilité"),
    ("hon_dpe", "HONORAIRES BÂTIMENT", "Calculs DPE"),
    ("hon_do", "HONORAIRES BÂTIMENT", "Assurance DO-TRC + CNR"),
    ("com_pub", "COMMERCIALISATION", "Publicité"),
    ("com_hono", "COMMERCIALISATION", "Honoraires commerciaux internes"),
    ("ges_ofs", "GESTION ET MOD", "OFS (BRS uniquement)"),
    ("ges_copro", "GESTION ET MOD", "Règlement de copropriété & frais d'acte"),
    ("ges_maquette", "GESTION ET MOD", "Maquette"),
    ("ges_sav", "GESTION ET MOD", "SAV"),
    ("ges_divers", "GESTION ET MOD", "Frais divers"),
    ("ges_rmo_int", "GESTION ET MOD", "RMO honoraires gestion interne"),
    ("ges_rmo_ext", "GESTION ET MOD", "RMO honoraires gestion externe"),
    ("fin_garantie", "FRAIS FINANCIERS", "Garantie de revente (BRS)"),
    ("fin_externes", "FRAIS FINANCIERS", "Frais financiers externes"),
]

# Lignes de ressources de base. auto = calcul par défaut (surchargeable cellule par cellule).
LIGNES_FIN_BASE: list[dict[str, Any]] = [
    {"id": "subv_etat", "libelle": "Subvention de l'État (aide à la pierre)", "nature": "subvention", "auto": True},
    {"id": "subv_collectivites", "libelle": "Subventions des collectivités", "nature": "subvention", "auto": True},
    {"id": "subv_action_logement", "libelle": "Subvention Action Logement", "nature": "subvention", "auto": True},
    {"id": "fonds_propres", "libelle": "Fonds propres bailleur", "nature": "fonds_propres", "auto": True},
    {"id": "fonds_propres_societaires", "libelle": "Fonds propres sociétaires", "nature": "fonds_propres", "auto": False},
    {"id": "pret_cnav", "libelle": "Prêt CNAV", "nature": "pret", "auto": False, "conditions": "pret_cnav"},
    {"id": "pret_action_logement", "libelle": "Prêt Action Logement", "nature": "pret", "auto": False, "conditions": "pret_action_logement"},
    {"id": "pret_complementaire", "libelle": "Prêt complémentaire (CPLS, bancaire…)", "nature": "pret", "auto": False, "conditions": "pret_complementaire"},
]

BAREME_DEFAUT: dict[str, Any] = {
    "millesime": 2026,
    "loyers_plai": {"Z1bis": 7.00, "Z1": 6.57, "Z2": 5.77, "Z3": 5.33},
    "loyers_plus": {"Z1bis": 7.85, "Z1": 7.40, "Z2": 6.49, "Z3": 6.01},
    "loyers_pls": {"Abis": 15.32, "A": 11.80, "B1": 10.17, "B2": 9.74, "C": 9.03},
    "loyers_pli": {"Abis": 19.71, "A": 14.64, "B1": 11.80, "B2": 10.26, "C": 10.26},
    "brs_prix_plafond_m2_su": {"Abis": 5837, "A": 4423, "B1": 3542, "B2": 3269, "C": 2857},
    "brs_plafonds_ressources": {
        "A": {"1": 38844, "2": 58057, "3": 76105, "4": 90863, "5": 108107, "pers_supp": 13557},
        "B1": {"1": 38844, "2": 58057, "3": 69786, "4": 83594, "5": 98956, "pers_supp": 12408},
        "B2C": {"1": 33771, "2": 45100, "3": 54235, "4": 65476, "5": 77023, "pers_supp": 9683},
    },
    "taux": {
        "livret_a": 0.017,
        "marge_plai": -0.002,
        "marge_plus": 0.006,
        "marge_pls": 0.0111,
        "taux_fixe_pli": 0.032,
        "marge_foncier_brs": 0.006,
        "ecart_action_logement": -0.0225,
        "plancher_action_logement": 0.0025,
        "taux_pret_complementaire": 0.035,
    },
    "regles": {
        "plafond_subv_etat_plai_logt": 60000,
        "plafond_subv_etat_plus_logt": 20000,
        "plafond_action_logement_plai_pct": 0.60,
        "plafond_action_logement_plus_pct": 0.30,
        "quotite_min_pret_pls_pct": 0.50,
        "duree_max_pli_bati_ans": 35,
        "quota_etat_pct": 0.30,
        "quota_etat_agents_publics_pct": 0.05,
        "quota_collectivites_pct": 0.20,
    },
}


# ─────────────────────────────────────────────────────────── utilitaires
def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _zero_par_produit() -> dict[str, float]:
    return {p: 0.0 for p in PRODUITS}


def _somme(d: dict[str, float]) -> float:
    return sum(d.get(p, 0.0) for p in PRODUITS)


def _fr_eur(v: float) -> str:
    return f"{v:,.0f} €".replace(",", " ")  # espace insécable : lisible à l'écran (l'espace fine est presque invisible)


def _fr_pct(v: float) -> str:
    return f"{v * 100:.0f} %"


def _fr_dec(v: float, d: int = 2) -> str:
    return f"{v:.{d}f}".replace(".", ",")


def _ratio(a: float, b: float) -> float:
    return a / b if b else 0.0


def annuite(montant: float, taux: float, duree: int) -> float:
    if montant <= 0 or duree <= 0:
        return 0.0
    if taux == 0:
        return montant / duree
    return float(npf.pmt(taux, duree, -montant))


def zone_abc_vers_groupe(zone_abc: str) -> str:
    return {"Abis": "A", "A": "A", "B1": "B1"}.get(zone_abc, "B2C")


def fusion_bareme(bareme: dict | None) -> dict:
    """Complète un barème partiel (édité par l'admin) avec les valeurs par défaut."""
    res = copy.deepcopy(BAREME_DEFAUT)
    for k, v in (bareme or {}).items():
        if isinstance(v, dict) and isinstance(res.get(k), dict):
            res[k].update(v)
        else:
            res[k] = v
    return res


# ─────────────────────────────────────────────────────────── données par défaut
def hypotheses_defaut(nom: str = "", commune: str = "", zone_123: str = "Z1", zone_abc: str = "A",
                      annee_livraison: int | None = None) -> dict:
    """Valeurs par défaut du fichier « Hypothèses de simulation 2 » (TVA PLI 10 % validée)."""
    return {
        "nom_operation": nom,
        "commune": commune,
        "zone_123": zone_123,
        "zone_abc": zone_abc,
        "annee_livraison": annee_livraison or date.today().year + 3,
        "annee_bareme": BAREME_DEFAUT["millesime"],
        # Coûts (servent au pré-remplissage du prix de revient)
        "charge_fonciere_m2": 876.09,
        "travaux_m2": 2600.0,
        "honoraires_pct": 0.12,
        "aleas_pct": 0.04,
        "frais_annexes_logt": 0.0,
        "decote_fonciere_brs_pct": 0.5,
        "tva": {"PLAI": 0.055, "PLUS": 0.10, "PLS": 0.10, "PLI": 0.10, "BRS": 0.0},
        "tva_cession_brs": 0.055,
        # Ressources
        "subv_etat_logt": {"PLAI": 12000.0, "PLUS": 1000.0, "PLS": 0.0, "PLI": 0.0, "BRS": 5000.0},
        "subv_collectivites_logt": 4000.0,
        "subv_action_logement_logt": 6000.0,
        "fonds_propres_pct": 0.10,
        "prets": {
            "PLAI": {"taux": 0.018, "duree": 40, "duree_foncier": 60},
            "PLUS": {"taux": 0.026, "duree": 40, "duree_foncier": 60},
            "PLS": {"taux": 0.0311, "duree": 40, "duree_foncier": 60},
            "PLI": {"taux": 0.038, "duree": 25, "duree_foncier": 50},
            "BRS": {"taux": 0.025, "duree": 50, "duree_foncier": 50},
        },
        "quotite_fonciere_mode": "prorata",  # prorata | pct_charge_fonciere
        "quotite_fonciere_pct": 0.90,
        "pret_cnav": {"taux": 0.0, "duree": 20},
        "pret_action_logement": {"taux": 0.0025, "duree": 40},
        "pret_complementaire": {"taux": 0.035, "duree": 25},
        # Loyers / redevance et exploitation
        "loyer_plafond": {"PLAI": 6.57, "PLUS": 7.40, "PLS": 11.0, "PLI": 10.93, "BRS": 2.5},
        "indexation_loyers": 0.02,
        "vacance": 0.02,
        "impayes": 0.01,
        "frais_gestion_pct": 0.08,
        "entretien_logt": 150.0,
        "pge_logt": 300.0,
        "assurance_logt": 80.0,
        "inflation_charges": 0.02,
        "tfpb_logt": 900.0,
        "exoneration_tfpb_ans": 25,
        "parkings_nb": 0,
        "parking_loyer_mensuel": 0.0,
        "rls_logt_mois": 0.0,
        "rls_part_logements": 0.0,
        "taux_actualisation": 0.04,
        "duree_projection": 50,
        # Surface utile
        "annexe_plafond_m2": 8.0,
        "annexe_ponderation": 0.5,
        # Cession BRS
        "prix_vente_brs_m2_su": 0.0,
    }


def programme_defaut() -> dict:
    return {p: [{"typologie": t, "nb": 0, "shab": 0.0, "annexe": 0.0} for t in TYPOLOGIES] for p in PRODUITS}


def prix_revient_defaut() -> dict:
    return {
        "lignes": [
            {"id": i, "rubrique": r, "libelle": l, "montants": _zero_par_produit(), "custom": False}
            for i, r, l in LIGNES_PR_DEFAUT
        ]
    }


def financement_defaut() -> dict:
    return {
        "montants": {l["id"]: {p: None for p in PRODUITS} for l in LIGNES_FIN_BASE},
        "complementaires": [],
    }


def simulation_defaut(nom: str = "", commune: str = "", zone_123: str = "Z1", zone_abc: str = "A",
                      annee_livraison: int | None = None) -> dict:
    return {
        "version": 1,
        "hypotheses": hypotheses_defaut(nom, commune, zone_123, zone_abc, annee_livraison),
        "programme": programme_defaut(),
        "prix_revient": prix_revient_defaut(),
        "financement": financement_defaut(),
        "reservations": [],
    }


def normaliser(data: dict | None) -> dict:
    """Complète une simulation incomplète (clés manquantes) sans écraser la saisie."""
    base = simulation_defaut()
    data = copy.deepcopy(data or {})
    hyp = base["hypotheses"]
    for k, v in (data.get("hypotheses") or {}).items():
        if isinstance(v, dict) and isinstance(hyp.get(k), dict):
            for kk, vv in v.items():
                if isinstance(vv, dict) and isinstance(hyp[k].get(kk), dict):
                    hyp[k][kk].update(vv)
                else:
                    hyp[k][kk] = vv
        else:
            hyp[k] = v
    prog = base["programme"]
    for p in PRODUITS:
        rows = (data.get("programme") or {}).get(p)
        if isinstance(rows, list) and rows:
            prog[p] = [
                {"typologie": str(r.get("typologie", "")), "nb": int(_num(r.get("nb"))),
                 "shab": _num(r.get("shab")), "annexe": _num(r.get("annexe"))}
                for r in rows
            ]
    pr = data.get("prix_revient") or {}
    if isinstance(pr.get("lignes"), list) and pr["lignes"]:
        lignes = []
        for l in pr["lignes"]:
            m = {p: _num((l.get("montants") or {}).get(p)) for p in PRODUITS}
            lignes.append({
                "id": l.get("id") or f"cus_{uuid.uuid4().hex[:8]}",
                "rubrique": l.get("rubrique") if l.get("rubrique") in RUBRIQUES else "GESTION ET MOD",
                "libelle": str(l.get("libelle", "")),
                "montants": m,
                "custom": bool(l.get("custom", False)),
            })
        base["prix_revient"]["lignes"] = lignes
    fin = data.get("financement") or {}
    for lid, vals in (fin.get("montants") or {}).items():
        if lid in base["financement"]["montants"] and isinstance(vals, dict):
            for p in PRODUITS:
                v = vals.get(p)
                base["financement"]["montants"][lid][p] = None if v is None or v == "" else _num(v)
    comps = []
    for c in fin.get("complementaires") or []:
        comps.append({
            "id": c.get("id") or f"fc_{uuid.uuid4().hex[:8]}",
            "libelle": str(c.get("libelle", "Financement complémentaire")),
            "nature": c.get("nature") if c.get("nature") in ("subvention", "pret", "fonds_propres") else "subvention",
            "montants": {p: _num((c.get("montants") or {}).get(p)) for p in PRODUITS},
            "taux": _num(c.get("taux")),
            "duree": int(_num(c.get("duree"), 20)),
        })
    base["financement"]["complementaires"] = comps
    base["reservations"] = [dict(r) for r in (data.get("reservations") or []) if isinstance(r, dict)]
    return base


def valider(data: dict) -> list[str]:
    """Erreurs bloquantes à la sauvegarde."""
    erreurs = []
    custom = [l for l in data["prix_revient"]["lignes"] if l.get("custom")]
    if len(custom) > MAX_LIGNES_SUPPLEMENTAIRES:
        erreurs.append(f"Au plus {MAX_LIGNES_SUPPLEMENTAIRES} lignes de dépenses supplémentaires (actuellement {len(custom)}).")
    comps = data["financement"]["complementaires"]
    if len(comps) > MAX_FINANCEMENTS_COMPLEMENTAIRES:
        erreurs.append(f"Au plus {MAX_FINANCEMENTS_COMPLEMENTAIRES} financements complémentaires (actuellement {len(comps)}).")
    h = data["hypotheses"]
    if h.get("zone_123") not in ZONES_123:
        erreurs.append(f"Zone 1/2/3 inconnue : {h.get('zone_123')}")
    if h.get("zone_abc") not in ZONES_ABC:
        erreurs.append(f"Zone A/B/C inconnue : {h.get('zone_abc')}")
    return erreurs


def prix_revient_depuis_hypotheses(data: dict) -> dict:
    """Pré-remplit les postes principaux du prix de revient à partir des ratios des hypothèses
    (logique du modèle « Bilan d'opération ») ; les autres postes sont laissés tels quels."""
    data = normaliser(data)
    h = data["hypotheses"]
    prog = calcul_programme(data)
    lignes = {l["id"]: l for l in data["prix_revient"]["lignes"]}
    for p in PRODUITS:
        shab = prog["par_produit"][p]["shab"]
        nb = prog["par_produit"][p]["nb"]
        foncier = shab * _num(h["charge_fonciere_m2"])
        if p == "BRS":
            foncier *= 1 - _num(h["decote_fonciere_brs_pct"])
        travaux = shab * _num(h["travaux_m2"])
        valeurs = {
            "fon_acquisition": foncier,
            "trv_tce": travaux,
            "hon_moe": travaux * _num(h["honoraires_pct"]),
            "trv_aleas": travaux * _num(h["aleas_pct"]),
            "ges_divers": nb * _num(h["frais_annexes_logt"]),
        }
        for lid, v in valeurs.items():
            if lid in lignes:
                lignes[lid]["montants"][p] = round(v, 2)
    return data


def appliquer_bareme(data: dict, bareme: dict | None) -> dict:
    """Reprend dans les hypothèses les loyers maximaux de la zone et les taux (Livret A + marges)."""
    data = normaliser(data)
    b = fusion_bareme(bareme)
    h = data["hypotheses"]
    z123, zabc = h["zone_123"], h["zone_abc"]
    for p, table, zone in (("PLAI", "loyers_plai", z123), ("PLUS", "loyers_plus", z123),
                           ("PLS", "loyers_pls", zabc), ("PLI", "loyers_pli", zabc)):
        if zone in b[table]:
            h["loyer_plafond"][p] = _num(b[table][zone])
    t = b["taux"]
    la = _num(t["livret_a"])
    h["prets"]["PLAI"]["taux"] = round(max(0.0, la + _num(t["marge_plai"])), 6)
    h["prets"]["PLUS"]["taux"] = round(max(0.0, la + _num(t["marge_plus"])), 6)
    h["prets"]["PLS"]["taux"] = round(max(0.0, la + _num(t["marge_pls"])), 6)
    h["prets"]["PLI"]["taux"] = round(_num(t["taux_fixe_pli"]), 6)
    h["prets"]["BRS"]["taux"] = round(max(0.0, la + _num(t["marge_foncier_brs"])), 6)
    h["pret_action_logement"]["taux"] = round(max(_num(t["plancher_action_logement"]), la + _num(t["ecart_action_logement"])), 6)
    h["pret_complementaire"]["taux"] = round(_num(t["taux_pret_complementaire"]), 6)
    h["annee_bareme"] = int(_num(b.get("millesime"), h["annee_bareme"]))
    return data


# ─────────────────────────────────────────────────────────── 2. programme & loyers
def calcul_programme(data: dict) -> dict:
    h = data["hypotheses"]
    plafond = _num(h.get("annexe_plafond_m2"), 8)
    pond = _num(h.get("annexe_ponderation"), 0.5)
    par_produit: dict[str, dict] = {}
    for p in PRODUITS:
        loyer_m2 = _num(h["loyer_plafond"].get(p))
        lignes = []
        nb_t = shab_t = su_t = loyer_t = 0.0
        for r in data["programme"][p]:
            nb = int(_num(r.get("nb")))
            shab = _num(r.get("shab"))
            annexe = _num(r.get("annexe"))
            retenue = min(annexe, plafond) * pond if annexe > 0 else 0.0
            su = shab + retenue
            mensuel = su * loyer_m2
            annuel = mensuel * 12
            lignes.append({
                "typologie": r.get("typologie"), "nb": nb, "shab_moy": shab, "shab_totale": nb * shab,
                "annexe_brute": annexe, "annexe_retenue": retenue, "su_moy": su, "su_totale": nb * su,
                "loyer_m2": loyer_m2, "loyer_mensuel_logt": mensuel, "loyer_annuel_logt": annuel,
                "loyer_annuel_total": annuel * nb,
            })
            nb_t += nb
            shab_t += nb * shab
            su_t += nb * su
            loyer_t += annuel * nb
        par_produit[p] = {
            "lignes": lignes, "nb": int(nb_t), "shab": shab_t, "su": su_t,
            "loyer_annuel": loyer_t, "loyer_m2": loyer_m2,
            "su_moy": _ratio(su_t, nb_t),
        }
    total = {
        "nb": sum(par_produit[p]["nb"] for p in PRODUITS),
        "shab": sum(par_produit[p]["shab"] for p in PRODUITS),
        "su": sum(par_produit[p]["su"] for p in PRODUITS),
        "loyer_annuel": sum(par_produit[p]["loyer_annuel"] for p in PRODUITS),
        "nb_locatif": sum(par_produit[p]["nb"] for p in LOCATIFS),
        "loyer_annuel_locatif": sum(par_produit[p]["loyer_annuel"] for p in LOCATIFS),
    }
    return {"par_produit": par_produit, "total": total}


# ─────────────────────────────────────────────────────────── 3. prix de revient
def calcul_prix_revient(data: dict, prog: dict) -> dict:
    h = data["hypotheses"]
    lignes = data["prix_revient"]["lignes"]
    par_rubrique = {r: _zero_par_produit() for r in RUBRIQUES}
    for l in lignes:
        r = l["rubrique"] if l["rubrique"] in RUBRIQUES else "GESTION ET MOD"
        for p in PRODUITS:
            par_rubrique[r][p] += _num(l["montants"].get(p))
    ht = {p: sum(par_rubrique[r][p] for r in RUBRIQUES) for p in PRODUITS}
    taux_tva = {p: _num(h["tva"].get(p)) for p in PRODUITS}
    tva = {p: ht[p] * taux_tva[p] for p in PRODUITS}
    ttc = {p: ht[p] + tva[p] for p in PRODUITS}
    foncier_ttc = {p: par_rubrique["FONCIER"][p] * (1 + taux_tva[p]) for p in PRODUITS}
    pp = prog["par_produit"]
    return {
        "lignes": [
            {**l, "total_ht": sum(_num(l["montants"].get(p)) for p in PRODUITS)} for l in lignes
        ],
        "par_rubrique": {r: {**v, "total": _somme(v)} for r, v in par_rubrique.items()},
        "ht": {**ht, "total": _somme(ht)},
        "taux_tva": taux_tva,
        "tva": {**tva, "total": _somme(tva)},
        "ttc": {**ttc, "total": _somme(ttc)},
        "foncier_ttc": foncier_ttc,
        "part_fonciere": {p: _ratio(foncier_ttc[p], ttc[p]) for p in PRODUITS},
        "par_logement": {**{p: _ratio(ttc[p], pp[p]["nb"]) for p in PRODUITS},
                         "total": _ratio(_somme(ttc), prog["total"]["nb"])},
        "par_m2_shab": {**{p: _ratio(ttc[p], pp[p]["shab"]) for p in PRODUITS},
                        "total": _ratio(_somme(ttc), prog["total"]["shab"])},
        "nb_lignes_supplementaires": sum(1 for l in lignes if l.get("custom")),
    }


# ─────────────────────────────────────────────────────────── 4. plan de financement
def calcul_financement(data: dict, prog: dict, pr: dict, bareme: dict) -> dict:
    h = data["hypotheses"]
    fin = data["financement"]
    pp = prog["par_produit"]
    ttc = {p: pr["ttc"][p] for p in PRODUITS}

    def auto(lid: str, p: str) -> float:
        nb = pp[p]["nb"]
        if lid == "subv_etat":
            return nb * _num(h["subv_etat_logt"].get(p))
        if lid == "subv_collectivites":
            return nb * _num(h["subv_collectivites_logt"])
        if lid == "subv_action_logement":
            return nb * _num(h["subv_action_logement_logt"])
        if lid == "fonds_propres":
            return round(ttc[p] * _num(h["fonds_propres_pct"]), 2)
        return 0.0

    lignes = []
    for d in LIGNES_FIN_BASE:
        saisies = fin["montants"].get(d["id"], {})
        montants, sources = {}, {}
        for p in PRODUITS:
            v = saisies.get(p)
            if v is None:
                montants[p] = auto(d["id"], p) if d["auto"] else 0.0
                sources[p] = "auto" if d["auto"] else "vide"
            else:
                montants[p] = _num(v)
                sources[p] = "saisie"
        cond = h.get(d.get("conditions", ""), {}) if d["nature"] == "pret" else {}
        lignes.append({**d, "montants": montants, "sources": sources, "total": _somme(montants),
                       "taux": _num(cond.get("taux")) if cond else None,
                       "duree": int(_num(cond.get("duree"))) if cond else None,
                       "complementaire": False})
    for c in fin["complementaires"]:
        m = {p: _num(c["montants"].get(p)) for p in PRODUITS}
        lignes.append({"id": c["id"], "libelle": c["libelle"], "nature": c["nature"], "auto": False,
                       "montants": m, "sources": {p: "saisie" for p in PRODUITS}, "total": _somme(m),
                       "taux": c["taux"] if c["nature"] == "pret" else None,
                       "duree": c["duree"] if c["nature"] == "pret" else None,
                       "complementaire": True})

    # Cession des droits réels (BRS)
    zone_abc = h.get("zone_abc", "A")
    plafond_brs = _num(bareme["brs_prix_plafond_m2_su"].get(zone_abc))
    prix_saisi = _num(h.get("prix_vente_brs_m2_su"))
    prix_retenu = min(prix_saisi, plafond_brs) if plafond_brs > 0 else prix_saisi
    su_brs = pp["BRS"]["su"]
    produit_ht = round(prix_retenu * su_brs, 2)
    produit_ttc = round(produit_ht * (1 + _num(h.get("tva_cession_brs"))), 2)
    cout_bati_brs = max(0.0, ttc["BRS"] - pr["foncier_ttc"]["BRS"])
    cession_affectee = min(produit_ht, cout_bati_brs)
    cession = {
        "prix_saisi_m2": prix_saisi, "prix_plafond_m2": plafond_brs, "prix_retenu_m2": prix_retenu,
        "su": su_brs, "produit_ht": produit_ht, "produit_ttc": produit_ttc,
        "prix_ttc_logt": _ratio(produit_ttc, pp["BRS"]["nb"]),
        "cout_bati": cout_bati_brs, "affectee": cession_affectee, "marge": produit_ht - cession_affectee,
        "plafonne": plafond_brs > 0 and prix_saisi > plafond_brs,
    }

    autres = {p: sum(l["montants"][p] for l in lignes) for p in PRODUITS}
    autres["BRS"] += cession_affectee
    emprunt = {p: max(0.0, ttc[p] - autres[p]) for p in PRODUITS}
    excedent = {p: max(0.0, autres[p] - ttc[p]) for p in PRODUITS}

    mode = h.get("quotite_fonciere_mode", "prorata")
    foncier_q, constr_q = {}, {}
    for p in PRODUITS:
        if p == "BRS":
            foncier_q[p] = emprunt[p]
        elif mode == "pct_charge_fonciere":
            foncier_q[p] = min(emprunt[p], _num(h.get("quotite_fonciere_pct")) * pr["par_rubrique"]["FONCIER"][p])
        else:
            foncier_q[p] = round(emprunt[p] * pr["part_fonciere"][p], 2)
        constr_q[p] = emprunt[p] - foncier_q[p]

    total_ressources = {p: autres[p] + emprunt[p] for p in PRODUITS}
    controle = {p: total_ressources[p] - ttc[p] for p in PRODUITS}

    # Prêts (pour les annuités et l'échéancier)
    prets = []
    for p in PRODUITS:
        cond = h["prets"].get(p, {})
        taux = _num(cond.get("taux"))
        if constr_q[p] > 0:
            prets.append({"libelle": f"Prêt principal {p} — construction", "produit": p, "montant": constr_q[p],
                          "taux": taux, "duree": int(_num(cond.get("duree"))), "type": "equilibre_construction"})
        if foncier_q[p] > 0:
            lib = "Prêt foncier BRS (portage OFS)" if p == "BRS" else f"Prêt principal {p} — foncier"
            prets.append({"libelle": lib, "produit": p, "montant": foncier_q[p], "taux": taux,
                          "duree": int(_num(cond.get("duree_foncier"))), "type": "equilibre_foncier"})
    for l in lignes:
        if l["nature"] != "pret":
            continue
        for p in PRODUITS:
            if l["montants"][p] > 0:
                prets.append({"libelle": f"{l['libelle']} — {p}", "produit": p, "montant": l["montants"][p],
                              "taux": _num(l["taux"]), "duree": int(_num(l["duree"])), "type": l["id"]})
    for pr_ in prets:
        pr_["annuite"] = annuite(pr_["montant"], pr_["taux"], pr_["duree"])

    def total_nature(nature: str) -> dict[str, float]:
        return {p: sum(l["montants"][p] for l in lignes if l["nature"] == nature) for p in PRODUITS}

    subventions = total_nature("subvention")
    fonds_propres = total_nature("fonds_propres")
    prets_autres = total_nature("pret")
    emprunts_total = {p: prets_autres[p] + emprunt[p] for p in PRODUITS}
    cession_par_p = {p: (cession_affectee if p == "BRS" else 0.0) for p in PRODUITS}
    annuites_a1 = {p: sum(x["annuite"] for x in prets if x["produit"] == p) for p in PRODUITS}

    structure = {}
    for nom, vals in (("subventions", subventions), ("fonds_propres", fonds_propres),
                      ("emprunts", emprunts_total), ("cession", cession_par_p)):
        structure[nom] = {**{p: _ratio(vals[p], ttc[p]) for p in PRODUITS},
                          "total": _ratio(_somme(vals), pr["ttc"]["total"])}

    def avec_total(d: dict[str, float]) -> dict[str, float]:
        return {**d, "total": _somme(d)}

    return {
        "lignes": lignes,
        "cession_brs": cession,
        "emprunt_equilibre": avec_total(emprunt),
        "quotite_fonciere": avec_total(foncier_q),
        "quotite_construction": avec_total(constr_q),
        "excedent": avec_total(excedent),
        "total_ressources": avec_total(total_ressources),
        "controle": avec_total(controle),
        "subventions": avec_total(subventions),
        "fonds_propres": avec_total(fonds_propres),
        "emprunts": avec_total(emprunts_total),
        "cession_affectee": avec_total(cession_par_p),
        "structure": structure,
        "prets": prets,
        "annuites_annee1": avec_total(annuites_a1),
        "nb_complementaires": len(fin["complementaires"]),
    }


def _echeancier(prets: list[dict], produits: list[str], n_annees: int) -> list[float]:
    annuites = [0.0] * (n_annees + 1)
    for x in prets:
        if x["produit"] not in produits:
            continue
        for n in range(1, min(x["duree"], n_annees) + 1):
            annuites[n] += x["annuite"]
    return annuites


def tableau_amortissement(pret: dict) -> list[dict]:
    rows, crd = [], pret["montant"]
    for n in range(1, pret["duree"] + 1):
        interets = crd * pret["taux"]
        capital = pret["annuite"] - interets
        crd = max(0.0, crd - capital)
        rows.append({"annee": n, "annuite": pret["annuite"], "interets": interets, "capital": capital, "crd": crd})
    return rows


# ─────────────────────────────────────────────────────────── 7. bilan d'exploitation
def calcul_exploitation(data: dict, prog: dict, fin: dict, avec_brs: bool = False) -> dict:
    """Compte d'exploitation prévisionnel.

    Sans BRS : partie locative seule (PLAI, PLUS, PLS, PLI), le compte OFS des BRS est présenté à part.
    Avec BRS : consolidation de la partie locative et du compte OFS (redevances, prêt foncier, fonds propres BRS).
    """
    h = data["hypotheses"]
    n_annees = max(1, min(60, int(_num(h.get("duree_projection"), 50))))
    pp = prog["par_produit"]
    perimetre = LOCATIFS + (["BRS"] if avec_brs else [])
    nb_loc = sum(pp[p]["nb"] for p in LOCATIFS)
    nb_exo = sum(pp[p]["nb"] for p in EXONERES_TFPB)
    nb_pli = pp["PLI"]["nb"]
    loyers_base = sum(pp[p]["loyer_annuel"] for p in LOCATIFS)
    livraison = int(_num(h.get("annee_livraison"), date.today().year))
    base = int(_num(h.get("annee_bareme"), BAREME_DEFAUT["millesime"]))
    idx = _num(h.get("indexation_loyers"))
    infl = _num(h.get("inflation_charges"))
    exo = int(_num(h.get("exoneration_tfpb_ans")))
    annuites = _echeancier(fin["prets"], perimetre, n_annees)
    fonds_propres_initiaux = sum(fin["fonds_propres"][p] for p in perimetre)
    redevance_brs_base = _num(h["loyer_plafond"].get("BRS")) * pp["BRS"]["su"] * 12 if avec_brs else 0.0

    lignes = []
    cumul = 0.0
    flux_cumul = -fonds_propres_initiaux
    flux = [-fonds_propres_initiaux]
    annee_equilibre = None
    annee_retour_fp = None
    for n in range(1, n_annees + 1):
        coef = (1 + idx) ** (livraison - base + n - 1)
        coef_ch = (1 + infl) ** (n - 1)
        loyers = loyers_base * coef
        parkings = _num(h.get("parkings_nb")) * _num(h.get("parking_loyer_mensuel")) * 12 * coef
        vacance = -(loyers + parkings) * _num(h.get("vacance"))
        impayes = -(loyers + parkings) * _num(h.get("impayes"))
        rls = -nb_loc * _num(h.get("rls_part_logements")) * _num(h.get("rls_logt_mois")) * 12 * coef
        redevances = redevance_brs_base * coef
        impayes += -redevances * _num(h.get("impayes"))
        produits = loyers + parkings + vacance + impayes + rls + redevances
        gestion = -(loyers + parkings + vacance + impayes + redevances) * _num(h.get("frais_gestion_pct"))
        entretien = -_num(h.get("entretien_logt")) * nb_loc * coef_ch
        pge = -_num(h.get("pge_logt")) * nb_loc * coef_ch
        assurance = -_num(h.get("assurance_logt")) * nb_loc * coef_ch
        nb_tfpb = nb_pli + (nb_exo if n > exo else 0)
        tfpb = -_num(h.get("tfpb_logt")) * nb_tfpb * coef_ch
        charges = gestion + entretien + pge + assurance + tfpb
        ebe = produits + charges
        ann = -annuites[n]
        autof = ebe + ann
        cumul += autof
        flux.append(autof)
        flux_cumul += autof
        if annee_equilibre is None and cumul > 0:
            annee_equilibre = n
        if annee_retour_fp is None and fonds_propres_initiaux > 0 and flux_cumul >= 0:
            annee_retour_fp = n
        lignes.append({
            "annee": n, "annee_civile": livraison + n - 1, "coef_indexation": coef,
            "loyers": loyers, "redevances_brs": redevances, "parkings": parkings, "vacance": vacance, "impayes": impayes, "rls": rls,
            "produits_nets": produits, "frais_gestion": gestion, "entretien": entretien, "pge": pge,
            "assurance": assurance, "tfpb": tfpb, "charges": charges, "autofinancement_brut": ebe,
            "annuites": ann, "autofinancement_net": autof, "cumul": cumul,
            "autof_sur_loyers": _ratio(autof, loyers + redevances), "annuites_sur_loyers": _ratio(-ann, loyers + redevances),
            "dscr": _ratio(ebe, -ann) if ann else None, "flux_cumule_fp": flux_cumul,
        })

    def tri(k: int):
        if fonds_propres_initiaux <= 0 or len(flux) <= k:
            return None
        try:
            v = float(npf.irr(flux[: k + 1]))
            return None if v != v else v  # NaN
        except Exception:
            return None

    taux_act = _num(h.get("taux_actualisation"))
    van40 = flux[0] + sum(f / (1 + taux_act) ** i for i, f in enumerate(flux[1:41], start=1)) if len(flux) > 1 else 0.0
    a1 = lignes[0]
    kpis = {
        "autofinancement_net_a1": a1["autofinancement_net"],
        "autof_sur_loyers_a1": a1["autof_sur_loyers"],
        "annuites_sur_loyers_a1": a1["annuites_sur_loyers"],
        "dscr_a1": a1["dscr"],
        "cumul_40": lignes[min(40, n_annees) - 1]["cumul"],
        "cumul_fin": lignes[-1]["cumul"],
        "annee_equilibre": annee_equilibre,
        "annee_retour_fonds_propres": annee_retour_fp,
        "fonds_propres_investis": fonds_propres_initiaux,
        "tri_fp_40": tri(40),
        "tri_fp_fin": tri(n_annees),
        "van_40": van40,
        "nb_annees": n_annees,
        "nb_logements": sum(pp[p]["nb"] for p in perimetre),
    }

    # Compte OFS — BRS : redevances foncières vs portage du foncier
    su_brs = pp["BRS"]["su"]
    redevance_m2 = _num(h["loyer_plafond"].get("BRS"))
    annuites_brs = _echeancier(fin["prets"], ["BRS"], n_annees)
    brs, cumul_brs = [], 0.0
    if pp["BRS"]["nb"] > 0 or annuites_brs[1] > 0:
        for n in range(1, n_annees + 1):
            coef = (1 + idx) ** (livraison - base + n - 1)
            red = redevance_m2 * su_brs * 12 * coef
            imp = -red * _num(h.get("impayes"))
            gest = -(red + imp) * _num(h.get("frais_gestion_pct"))
            ann = -annuites_brs[n]
            solde = red + imp + gest + ann
            cumul_brs += solde
            brs.append({"annee": n, "annee_civile": livraison + n - 1, "redevances": red, "impayes": imp,
                        "frais_gestion": gest, "annuites": ann, "solde": solde, "cumul": cumul_brs})
    return {"perimetre": "avec_brs" if avec_brs else "sans_brs", "lignes": lignes, "kpis": kpis, "brs": brs}


# ─────────────────────────────────────────────────────────── 5. réservations
def calcul_reservations(data: dict, prog: dict, bareme: dict, aujourd_hui: date | None = None) -> dict:
    aujourd_hui = aujourd_hui or date.today()
    rows = data["reservations"]
    nb_logements = prog["total"]["nb"]
    par_categorie: dict[str, int] = {}
    par_statut: dict[str, int] = {}
    echeances = []
    for r in rows:
        cat = r.get("categorie") or "Non réservé (bailleur)"
        par_categorie[cat] = par_categorie.get(cat, 0) + 1
        st = r.get("statut") or "Réservé"
        par_statut[st] = par_statut.get(st, 0) + 1
        ech = r.get("date_echeance")
        if ech:
            try:
                d = date.fromisoformat(str(ech)[:10])
                jours = (d - aujourd_hui).days
                if jours <= 183:
                    echeances.append({"logement": r.get("logement", ""), "reservataire": r.get("reservataire", ""),
                                      "date_echeance": d.isoformat(), "jours": jours})
            except ValueError:
                pass
    reg = bareme["regles"]
    etat = par_categorie.get("État – publics prioritaires", 0) + par_categorie.get("État – agents publics", 0)
    agents = par_categorie.get("État – agents publics", 0)
    collectivites = par_categorie.get("Commune", 0) + par_categorie.get("EPCI", 0)
    reserves = sum(v for k, v in par_categorie.items() if k != "Non réservé (bailleur)")
    quotas = [
        {"libelle": "État (dont agents publics)", "nb": etat, "part": _ratio(etat, nb_logements),
         "plafond": _num(reg["quota_etat_pct"])},
        {"libelle": "État – agents publics", "nb": agents, "part": _ratio(agents, nb_logements),
         "plafond": _num(reg["quota_etat_agents_publics_pct"])},
        {"libelle": "Communes et EPCI", "nb": collectivites, "part": _ratio(collectivites, nb_logements),
         "plafond": _num(reg["quota_collectivites_pct"])},
    ]
    for q in quotas:
        q["depasse"] = q["part"] > q["plafond"] + 1e-9
    return {
        "nb_lignes": len(rows), "nb_logements_programme": nb_logements, "nb_reserves": reserves,
        "taux_reservation": _ratio(reserves, nb_logements),
        "par_categorie": [{"categorie": k, "nb": v, "part": _ratio(v, nb_logements)} for k, v in par_categorie.items()],
        "par_statut": par_statut, "quotas": quotas,
        "echeances_proches": sorted(echeances, key=lambda e: e["jours"]),
    }


# ─────────────────────────────────────────────────────────── alertes
def _alertes(data: dict, prog: dict, pr: dict, fin: dict, exp: dict, resa: dict, bareme: dict) -> list[dict]:
    h = data["hypotheses"]
    pp = prog["par_produit"]
    reg = bareme["regles"]
    out: list[dict] = []

    def add(niveau: str, onglet: str, msg: str):
        out.append({"niveau": niveau, "onglet": onglet, "message": msg})

    if prog["total"]["nb"] == 0:
        add("info", "programme", "Aucun logement saisi dans le programme.")
    for p in PRODUITS:
        if pp[p]["nb"] > 0 and pr["ttc"][p] <= 0:
            add("warn", "prix-revient", f"{p} : {pp[p]['nb']} logements mais aucun prix de revient saisi.")
        if pp[p]["nb"] == 0 and pr["ttc"][p] > 0:
            add("warn", "programme", f"{p} : un prix de revient est saisi mais aucun logement n'est programmé.")
        if fin["excedent"][p] > 1:
            add("danger", "financement", f"{p} : sur-financement de {_fr_eur(fin['excedent'][p])} — réduire les fonds propres "
                                         "ou les autres ressources.")

    # Loyers plafonds vs barème
    z123, zabc = h.get("zone_123"), h.get("zone_abc")
    maxi = {
        "PLAI": _num(bareme["loyers_plai"].get(z123)),
        "PLUS": _num(bareme["loyers_plus"].get(z123)),
        "PLS": _num(bareme["loyers_pls"].get(zabc)),
        "PLI": _num(bareme["loyers_pli"].get(zabc)),
    }
    for p, m in maxi.items():
        v = _num(h["loyer_plafond"].get(p))
        if m > 0 and v > m + 1e-9 and pp[p]["nb"] > 0:
            zone = z123 if p in ("PLAI", "PLUS") else zabc
            add("danger", "hypotheses", f"Loyer {p} {_fr_dec(v)} €/m² SU > maximum réglementaire {_fr_dec(m)} € (zone {zone}).")

    # Contrôles réglementaires du plan de financement
    lignes = {l["id"]: l for l in fin["lignes"]}
    for p, plafond in (("PLAI", reg["plafond_subv_etat_plai_logt"]), ("PLUS", reg["plafond_subv_etat_plus_logt"])):
        nb = pp[p]["nb"]
        if nb and lignes["subv_etat"]["montants"][p] / nb > _num(plafond):
            add("warn", "financement", f"Subvention de l'État {p} au-dessus du plafond de {_fr_eur(_num(plafond))}/logement.")
    for p, pct in (("PLAI", reg["plafond_action_logement_plai_pct"]), ("PLUS", reg["plafond_action_logement_plus_pct"])):
        al = lignes["subv_action_logement"]["montants"][p] + lignes["pret_action_logement"]["montants"][p]
        if pr["ttc"][p] and al > _num(pct) * pr["ttc"][p] + 1:
            add("warn", "financement", f"Action Logement {p} au-dessus du plafond de {_fr_pct(_num(pct))} du prix de revient.")
    if pp["PLS"]["nb"] and fin["emprunt_equilibre"]["PLS"] < _num(reg["quotite_min_pret_pls_pct"]) * pr["ttc"]["PLS"]:
        add("warn", "financement", f"Prêt PLS inférieur à {_fr_pct(_num(reg['quotite_min_pret_pls_pct']))} du prix de revient (art. D.331-20 CCH).")
    if pp["PLI"]["nb"] and int(_num(h["prets"]["PLI"].get("duree"))) > int(_num(reg["duree_max_pli_bati_ans"])):
        add("warn", "hypotheses", f"Durée du prêt PLI bâti supérieure à {int(_num(reg['duree_max_pli_bati_ans']))} ans.")
    c = fin["cession_brs"]
    if pp["BRS"]["nb"]:
        if c["plafonne"]:
            add("info", "financement", f"Prix de vente BRS plafonné à {_fr_eur(c['prix_plafond_m2'])}/m² SU (zone {zabc}).")
        if c["produit_ht"] < c["cout_bati"]:
            add("warn", "financement", "Cession BRS inférieure au coût du bâti : le prêt foncier finance la différence.")
        if c["prix_saisi_m2"] <= 0:
            add("info", "hypotheses", "Prix de vente BRS non renseigné (€/m² SU).")

    k = exp["kpis"]
    if prog["total"]["nb_locatif"]:
        if k["autofinancement_net_a1"] < 0:
            add("warn", "exploitation", f"Autofinancement net négatif en année 1 ({_fr_eur(k['autofinancement_net_a1'])}).")
        if k["dscr_a1"] is not None and k["dscr_a1"] < 1:
            add("warn", "exploitation", f"Couverture des annuités insuffisante en année 1 (DSCR {_fr_dec(k['dscr_a1'])}).")
        if k["annee_equilibre"] is None:
            add("danger", "exploitation", f"Le cumul d'autofinancement ne redevient pas positif sur {k['nb_annees']} ans.")

    for q in resa["quotas"]:
        if q["depasse"]:
            add("warn", "reservations", f"{q['libelle']} : {_fr_pct(q['part'])} des logements, au-delà du repère légal de {_fr_pct(q['plafond'])}.")
    if resa["nb_lignes"] > prog["total"]["nb"] and prog["total"]["nb"]:
        add("warn", "reservations", f"{resa['nb_lignes']} réservations saisies pour {prog['total']['nb']} logements.")
    for e in resa["echeances_proches"]:
        add("info", "reservations", f"Convention {e['reservataire'] or e['logement']} : échéance le {e['date_echeance']}.")
    return out


# ─────────────────────────────────────────────────────────── 8. synthèse
def _synthese(data: dict, prog: dict, pr: dict, fin: dict, exp: dict, avec_brs: bool = True) -> dict:
    """Synthèse de l'opération, avec ou sans les logements BRS (exp : bilan d'exploitation du même périmètre)."""
    h = data["hypotheses"]
    pp = prog["par_produit"]
    k = exp["kpis"]
    produits = PRODUITS if avec_brs else LOCATIFS

    def somme(d: dict) -> float:
        return sum(_num(d.get(p)) for p in produits)

    nb = sum(pp[p]["nb"] for p in produits)
    shab = sum(pp[p]["shab"] for p in produits)
    ttc = somme(pr["ttc"])
    montants = {"subventions": somme(fin["subventions"]), "fonds_propres": somme(fin["fonds_propres"]),
                "emprunts": somme(fin["emprunts"]), "cession": somme(fin["cession_affectee"])}
    structure = [
        {"poste": "Subventions", "montant": montants["subventions"], "part": _ratio(montants["subventions"], ttc)},
        {"poste": "Fonds propres", "montant": montants["fonds_propres"], "part": _ratio(montants["fonds_propres"], ttc)},
        {"poste": "Emprunts", "montant": montants["emprunts"], "part": _ratio(montants["emprunts"], ttc)},
    ]
    if avec_brs:
        structure.append({"poste": "Cession BRS affectée", "montant": montants["cession"], "part": _ratio(montants["cession"], ttc)})
    return {
        "perimetre": "avec_brs" if avec_brs else "sans_brs",
        "a_des_brs": pp["BRS"]["nb"] > 0,
        "titre": f"{h.get('nom_operation') or 'Opération'} — {h.get('commune') or ''}".strip(" —"),
        "zones": {"zone_123": h.get("zone_123"), "zone_abc": h.get("zone_abc")},
        "annee_livraison": h.get("annee_livraison"),
        "nb_logements": nb,
        "shab": shab,
        "su": sum(pp[p]["su"] for p in produits),
        "prix_revient_ttc": ttc,
        "prix_revient_logt": _ratio(ttc, nb),
        "prix_revient_m2": _ratio(ttc, shab),
        "autofinancement_net_a1": k["autofinancement_net_a1"],
        "dscr_a1": k["dscr_a1"],
        "annee_equilibre": k["annee_equilibre"],
        "fonds_propres_total": montants["fonds_propres"],
        "subventions_total": montants["subventions"],
        "emprunts_total": montants["emprunts"],
        "cession_affectee": montants["cession"],
        "annuites_a1": somme(fin["annuites_annee1"]),
        "repartition": [
            {"produit": p, "nb": pp[p]["nb"], "shab": pp[p]["shab"], "su": pp[p]["su"],
             "prix_revient_ttc": pr["ttc"][p], "loyer_m2": pp[p]["loyer_m2"], "loyer_annuel": pp[p]["loyer_annuel"]}
            for p in produits
        ],
        "structure": structure,
        "brs": {
            "produit_cession_ht": fin["cession_brs"]["produit_ht"] if avec_brs else 0.0,
            "marge_cession": fin["cession_brs"]["marge"] if avec_brs else 0.0,
            "solde_ofs_a1": exp["brs"][0]["solde"] if (avec_brs and exp["brs"]) else None,
        },
    }


# ─────────────────────────────────────────────────────────── point d'entrée
def calculer(data: dict | None, bareme: dict | None = None, aujourd_hui: date | None = None) -> dict:
    data = normaliser(data)
    bareme = fusion_bareme(bareme)
    prog = calcul_programme(data)
    pr = calcul_prix_revient(data, prog)
    fin = calcul_financement(data, prog, pr, bareme)
    exp = calcul_exploitation(data, prog, fin)  # sans BRS : partie locative (compte OFS à part)
    exp_brs = calcul_exploitation(data, prog, fin, avec_brs=True)  # avec BRS : locatif + compte OFS consolidés
    resa = calcul_reservations(data, prog, bareme, aujourd_hui)
    alertes = _alertes(data, prog, pr, fin, exp, resa, bareme)
    synthese = _synthese(data, prog, pr, fin, exp_brs, avec_brs=True)
    synthese_sans_brs = _synthese(data, prog, pr, fin, exp, avec_brs=False)
    bilan = {
        "emplois": pr["par_rubrique"],
        "ht": pr["ht"], "tva": pr["tva"], "ttc": pr["ttc"],
        "par_logement": pr["par_logement"], "par_m2_shab": pr["par_m2_shab"],
        "ressources": [{"libelle": l["libelle"], "nature": l["nature"], "montants": l["montants"], "total": l["total"]}
                       for l in fin["lignes"]],
        "cession_affectee": fin["cession_affectee"],
        "emprunt_equilibre": fin["emprunt_equilibre"],
        "total_ressources": fin["total_ressources"],
        "controle": fin["controle"],
        "structure": fin["structure"],
    }
    return {
        "programme": prog,
        "prix_revient": pr,
        "financement": fin,
        "reservations": resa,
        "bilan_operation": bilan,
        "exploitation": exp,
        "exploitation_avec_brs": exp_brs,
        "synthese": synthese,
        "synthese_sans_brs": synthese_sans_brs,
        "alertes": alertes,
        "bareme": bareme,
        "limites": {"lignes_supplementaires": MAX_LIGNES_SUPPLEMENTAIRES,
                    "financements_complementaires": MAX_FINANCEMENTS_COMPLEMENTAIRES},
    }
