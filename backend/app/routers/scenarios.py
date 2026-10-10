"""M5 — Scénarios : CRUD, édition hypothèses, duplication, sensibilité, comparaison."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from datetime import datetime, timezone
from copy import deepcopy

from ..db import get_session
from ..models import Scenario
from ..engines.bilan import calcul_bilan_operation, BilanInput, LigneSaisie, Vente, SubventionGlobale
from ..engines.exploitation import calcul_exploitation, ExploitationInput, Pret, Composant

router = APIRouter()


# -----------------------------------------------------------------------------
# CRUD de base
# -----------------------------------------------------------------------------

@router.get("/{scenario_id}")
def get_scenario(scenario_id: int, session: Session = Depends(get_session)) -> Scenario:
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    return sc


@router.put("/{scenario_id}/hypotheses")
def update_hypotheses(
    scenario_id: int,
    hypotheses: dict,
    session: Session = Depends(get_session),
) -> Scenario:
    """Remplace entièrement l'objet hypotheses."""
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    sc.hypotheses = hypotheses
    # Invalider résultats stockés (ils ne correspondent plus)
    sc.bilan_result = None
    sc.exploitation_result = None
    sc.updated_at = datetime.now(timezone.utc)
    session.add(sc)
    session.commit()
    session.refresh(sc)
    return sc


@router.patch("/{scenario_id}/hypotheses")
def patch_hypotheses(
    scenario_id: int,
    patch: dict,
    session: Session = Depends(get_session),
) -> Scenario:
    """Fusionne un patch partiel dans hypotheses (nested merge au 1er niveau)."""
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    hyp = deepcopy(sc.hypotheses or {})
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(hyp.get(k), dict):
            hyp[k].update(v)
        else:
            hyp[k] = v
    sc.hypotheses = hyp
    sc.bilan_result = None
    sc.exploitation_result = None
    sc.updated_at = datetime.now(timezone.utc)
    session.add(sc)
    session.commit()
    session.refresh(sc)
    return sc


@router.post("/{scenario_id}/duplicate")
def duplicate_scenario(
    scenario_id: int,
    nom: str = "Variante",
    session: Session = Depends(get_session),
) -> Scenario:
    src = session.get(Scenario, scenario_id)
    if not src:
        raise HTTPException(404, "Scénario introuvable")
    dup = Scenario(
        operation_id=src.operation_id,
        nom=nom,
        hypotheses=deepcopy(src.hypotheses),
    )
    session.add(dup)
    session.commit()
    session.refresh(dup)
    return dup


@router.delete("/{scenario_id}")
def delete_scenario(scenario_id: int, session: Session = Depends(get_session)) -> dict:
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    if sc.is_reference:
        raise HTTPException(400, "Impossible de supprimer le scénario de référence")
    session.delete(sc)
    session.commit()
    return {"ok": True}


# -----------------------------------------------------------------------------
# Sensibilité
# -----------------------------------------------------------------------------

# Variables sur lesquelles on peut faire varier la sensibilité
SENSIBILITE_PARAMS = {
    "cout_foncier_pct": {
        "label": "Coût foncier (% du nominal)",
        "cible": "ligne foncier",
        "default_range": [50, 150],
        "step": 10,
    },
    "cout_travaux_pct": {
        "label": "Coût travaux (% du nominal)",
        "cible": "ligne travaux TCE",
        "default_range": [80, 130],
        "step": 5,
    },
    "subvention_pli_pct": {
        "label": "Subvention PLI (% du nominal)",
        "cible": "subvention volet PLI",
        "default_range": [0, 150],
        "step": 10,
    },
    "taux_pls_pct": {
        "label": "Taux Prêt PLS CDC (%)",
        "cible": "prêt PLS taux",
        "default_range": [2.0, 6.0],
        "step": 0.5,
    },
    "loyer_initial_pct": {
        "label": "Loyer initial (% du nominal)",
        "cible": "exploitation loyer",
        "default_range": [80, 130],
        "step": 5,
    },
}


def _apply_variation(hyp: dict, param: str, factor: float) -> dict:
    """Retourne une copie des hypothèses avec le param appliqué.
    factor = 1.0 → nominal ; 1.1 → +10 %, ou valeur absolue selon le param.
    """
    h = deepcopy(hyp)
    if param == "cout_foncier_pct":
        for l in h.get("lignes", []):
            if l.get("rubrique") == "FONCIER":
                for k in ("brs", "pli"):
                    l[k] = l.get(k, 0) * factor
    elif param == "cout_travaux_pct":
        for l in h.get("lignes", []):
            if l.get("rubrique") == "TRAVAUX BÂTIMENT" and "TCE" in l.get("poste", ""):
                for k in ("brs", "pli"):
                    l[k] = l.get(k, 0) * factor
    elif param == "subvention_pli_pct":
        for s in h.get("subventions", []):
            if s.get("volet") == "PLI":
                s["montant"] = s.get("montant", 0) * factor
    elif param == "taux_pls_pct":
        expl = h.get("exploitation", {})
        for p in expl.get("prets", []):
            if "PLS" in p.get("nom", ""):
                p["taux_pct"] = factor  # ici factor = valeur absolue
    elif param == "loyer_initial_pct":
        expl = h.get("exploitation", {})
        if "loyer_annuel_initial" in expl:
            expl["loyer_annuel_initial"] = expl["loyer_annuel_initial"] * factor
    return h


def _compute_bilan(op, hyp) -> dict:
    lignes = [LigneSaisie(**l) for l in hyp.get("lignes", [])]
    ventes = [Vente(**v) for v in hyp.get("ventes", [])]
    subv = [SubventionGlobale(**s) for s in hyp.get("subventions", [])]
    inp = BilanInput(
        operation_code=op.code, nom=op.nom, commune=op.commune,
        zone_brs=op.zone_brs, livraison_cible=op.livraison_cible,
        lignes=lignes, ventes=ventes, subventions=subv,
    )
    return calcul_bilan_operation(inp).to_dict()


def _compute_exploit(op, hyp) -> dict | None:
    expl_hyp = hyp.get("exploitation")
    if not expl_hyp:
        return None
    prets = [Pret(**p) for p in expl_hyp.get("prets", [])]
    composants = [Composant(**c) for c in expl_hyp.get("composants", [])]
    inp = ExploitationInput(
        operation_code=op.code, nom=op.nom,
        zone=expl_hyp.get("zone", op.zone_brs),
        annee_mise_en_service=expl_hyp.get("annee_mise_en_service", 2027),
        duree_projection_ans=expl_hyp.get("duree_projection_ans", 40),
        nb_logements=expl_hyp.get("nb_logements", 0),
        shab_m2=expl_hyp.get("shab_m2", 0),
        su_m2=expl_hyp.get("su_m2", 0),
        loyer_annuel_initial=expl_hyp.get("loyer_annuel_initial", 0),
        taux_impayes_pct=expl_hyp.get("taux_impayes_pct", 3.0),
        taux_evolution_loyers_pct=expl_hyp.get("taux_evolution_loyers_pct", 2.0),
        recettes_annexes_annuel=expl_hyp.get("recettes_annexes_annuel", 0),
        frais_gestion_par_logement=expl_hyp.get("frais_gestion_par_logement", 1000),
        taux_evolution_charges_pct=expl_hyp.get("taux_evolution_charges_pct", 3.0),
        tfpb_par_logement=expl_hyp.get("tfpb_par_logement", 1250),
        duree_exoneration_tfpb_ans=expl_hyp.get("duree_exoneration_tfpb_ans", 25),
        tadb_par_logement=expl_hyp.get("tadb_par_logement", 0),
        prets=prets,
        prix_de_revient=expl_hyp.get("prix_de_revient", 0),
        fonds_propres=expl_hyp.get("fonds_propres", 0),
        composants=composants,
        taux_actualisation_pct=expl_hyp.get("taux_actualisation_pct", 3.0),
    )
    return calcul_exploitation(inp).to_dict()


@router.get("/sensibilite/params")
def list_sensibilite_params() -> dict:
    return SENSIBILITE_PARAMS


@router.post("/{scenario_id}/sensibilite")
def sensibilite(
    scenario_id: int,
    body: dict,
    session: Session = Depends(get_session),
) -> dict:
    """Varie un paramètre sur une plage, retourne les KPIs pour chaque valeur.

    body = { "param": "cout_foncier_pct", "values": [50, 75, 100, 125, 150] }
    Les valeurs sont des pourcentages (sauf taux_pls_pct en valeur absolue).
    """
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    op = sc.operation
    param = body.get("param")
    values = body.get("values", [])
    if param not in SENSIBILITE_PARAMS:
        raise HTTPException(400, f"Paramètre inconnu : {param}")
    if not values:
        info = SENSIBILITE_PARAMS[param]
        lo, hi = info["default_range"]
        step = info["step"]
        n = int((hi - lo) / step) + 1
        values = [round(lo + i * step, 3) for i in range(n)]

    rows = []
    for v in values:
        # Pour les pct, factor = v/100 ; pour taux abs, factor = v
        factor = v / 100 if param != "taux_pls_pct" else v
        hyp = _apply_variation(sc.hypotheses or {}, param, factor)
        bilan = _compute_bilan(op, hyp)
        exploit = _compute_exploit(op, hyp)
        rows.append({
            "value": v,
            "marge_nette": bilan["marge_nette_totale"],
            "marge_nette_pct": bilan["marge_nette_pct"],
            "marge_brute": bilan["marge_brute_totale"],
            "prix_revient": bilan["prix_revient_ht_total"],
            "loyer_equilibre_m2_mois": exploit["loyer_equilibre_m2_mois"] if exploit else None,
            "caf_annee_1": exploit["caf_annee_1"] if exploit else None,
            "cumul_tresorerie_fin": exploit["cumul_tresorerie_fin"] if exploit else None,
        })
    return {
        "scenario_id": scenario_id,
        "param": param,
        "param_label": SENSIBILITE_PARAMS[param]["label"],
        "values": values,
        "rows": rows,
    }


# -----------------------------------------------------------------------------
# Comparaison côte-à-côte
# -----------------------------------------------------------------------------

@router.post("/compare")
def compare_scenarios(body: dict, session: Session = Depends(get_session)) -> dict:
    """Compare N scénarios côte-à-côte. body = { "scenario_ids": [1, 2, ...] }"""
    ids = body.get("scenario_ids", [])
    if not ids or len(ids) < 2:
        raise HTTPException(400, "Au moins 2 scénarios requis")

    out = []
    for sid in ids:
        sc = session.get(Scenario, sid)
        if not sc:
            continue
        op = sc.operation
        bilan = _compute_bilan(op, sc.hypotheses or {})
        exploit = _compute_exploit(op, sc.hypotheses or {})
        out.append({
            "scenario_id": sid,
            "nom": sc.nom,
            "is_reference": sc.is_reference,
            "bilan": bilan,
            "exploitation": exploit,
        })
    return {"scenarios": out}
