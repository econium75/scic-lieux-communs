"""Endpoints de calcul : exposent les moteurs M2 et M4 (M3 à venir session 3)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..db import get_session
from ..models import Scenario, Menage, AuditLog
from ..engines.bilan import (
    calcul_bilan_operation, BilanInput, LigneSaisie, Vente, SubventionGlobale,
)
from ..engines.commercialisation import (
    calcul_qualification, MenageInput, CompositionFamille,
)
from ..engines.exploitation import (
    calcul_exploitation, ExploitationInput, Pret, Composant,
)

router = APIRouter()


@router.post("/bilan/{scenario_id}")
def calculer_bilan(scenario_id: int, session: Session = Depends(get_session)) -> dict:
    """M2 — bilan d'opération avec ventilation BRS vs PLI."""
    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(404, "Scénario introuvable")

    op = scenario.operation
    hyp = scenario.hypotheses or {}

    lignes = [LigneSaisie(**l) for l in hyp.get("lignes", [])]
    ventes = [Vente(**v) for v in hyp.get("ventes", [])]
    subventions = [SubventionGlobale(**s) for s in hyp.get("subventions", [])]

    inp = BilanInput(
        operation_code=op.code,
        nom=op.nom,
        commune=op.commune,
        zone_brs=op.zone_brs,
        livraison_cible=op.livraison_cible,
        lignes=lignes,
        ventes=ventes,
        subventions=subventions,
    )
    result = calcul_bilan_operation(inp)
    scenario.bilan_result = result.to_dict()
    session.add(scenario)
    session.add(AuditLog(
        action="calcul_bilan",
        target_type="scenario",
        target_id=scenario_id,
        payload={
            "prix_revient_ht": result.prix_revient_ht_total,
            "marge_nette": result.marge_nette_totale,
            "marge_brute": result.marge_brute_totale,
        },
    ))
    session.commit()
    return result.to_dict()


@router.post("/commercialisation/{menage_id}")
def calculer_commercialisation(menage_id: int, session: Session = Depends(get_session)) -> dict:
    """M4 — qualification du ménage pour accession BRS."""
    menage = session.get(Menage, menage_id)
    if not menage:
        raise HTTPException(404, "Ménage introuvable")

    # On reconstruit la composition à partir des champs plats + éventuellement
    # un dict composition stocké dans qualification.input (voir ci-dessous).
    comp_dict = (menage.qualification or {}).get("input_composition") if menage.qualification else None
    if comp_dict:
        composition = CompositionFamille(**comp_dict)
    else:
        # fallback approximatif à partir des champs plats
        adultes = max(1, menage.nb_personnes - menage.nb_enfants)
        composition = CompositionFamille(
            adultes=adultes,
            enfants_moins_14=menage.nb_enfants,  # simplification
            enfants_14_plus=0,
        )

    revenu_an = menage.revenu_fiscal_annuel
    prestations_an = menage.prestations_sociales_mensuelles * 12

    inp = MenageInput(
        reference=menage.reference,
        typologie_logement=menage.typologie_logement,  # type: ignore[arg-type]
        composition=composition,
        revenu_activites_annuel=revenu_an,
        revenus_patrimoine_annuel=0.0,
        prestations_sociales_annuel=prestations_an,
        apport=menage.apport,
    )
    result = calcul_qualification(inp)
    menage.qualification = result.to_dict()
    session.add(menage)
    session.add(AuditLog(
        action="calcul_commercialisation",
        target_type="menage",
        target_id=menage_id,
        payload={"verdict": result.verdict, "decile": result.decile, "taux_effort": result.taux_effort_pct},
    ))
    session.commit()
    return result.to_dict()


@router.post("/commercialisation/preview")
def preview_commercialisation(payload: dict) -> dict:
    """M4 — simulation ad-hoc sans persister (prévisualisation UI)."""
    comp = CompositionFamille(**payload.get("composition", {}))
    inp = MenageInput(
        reference=payload.get("reference", "preview"),
        typologie_logement=payload.get("typologie_logement", "T3"),
        composition=comp,
        revenu_activites_annuel=float(payload.get("revenu_activites_annuel", 0)),
        revenus_patrimoine_annuel=float(payload.get("revenus_patrimoine_annuel", 0)),
        prestations_sociales_annuel=float(payload.get("prestations_sociales_annuel", 0)),
        apport=float(payload.get("apport", 0)),
    )
    return calcul_qualification(inp).to_dict()


@router.post("/exploitation/{scenario_id}")
def calculer_exploitation(scenario_id: int, session: Session = Depends(get_session)) -> dict:
    """M3 — compte d'exploitation locatif pluriannuel (type PLS CDC) sur 30-40 ans."""
    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(404, "Scénario introuvable")

    op = scenario.operation
    hyp = (scenario.hypotheses or {}).get("exploitation")
    if not hyp:
        raise HTTPException(
            400,
            "Hypothèses d'exploitation manquantes — attendues sous scenario.hypotheses['exploitation']."
        )

    prets = [Pret(**p) for p in hyp.get("prets", [])]
    composants = [Composant(**c) for c in hyp.get("composants", [])]

    inp = ExploitationInput(
        operation_code=op.code,
        nom=op.nom,
        zone=hyp.get("zone", op.zone_brs),
        annee_mise_en_service=hyp.get("annee_mise_en_service", 2027),
        duree_projection_ans=hyp.get("duree_projection_ans", 40),
        nb_logements=hyp.get("nb_logements", 0),
        shab_m2=hyp.get("shab_m2", 0),
        su_m2=hyp.get("su_m2", 0),
        loyer_annuel_initial=hyp.get("loyer_annuel_initial", 0),
        taux_impayes_pct=hyp.get("taux_impayes_pct", 3.0),
        taux_evolution_loyers_pct=hyp.get("taux_evolution_loyers_pct", 2.0),
        recettes_annexes_annuel=hyp.get("recettes_annexes_annuel", 0),
        frais_gestion_par_logement=hyp.get("frais_gestion_par_logement", 1000),
        taux_evolution_charges_pct=hyp.get("taux_evolution_charges_pct", 3.0),
        tfpb_par_logement=hyp.get("tfpb_par_logement", 1250),
        duree_exoneration_tfpb_ans=hyp.get("duree_exoneration_tfpb_ans", 25),
        tadb_par_logement=hyp.get("tadb_par_logement", 0),
        prets=prets,
        prix_de_revient=hyp.get("prix_de_revient", 0),
        fonds_propres=hyp.get("fonds_propres", 0),
        composants=composants,
        taux_actualisation_pct=hyp.get("taux_actualisation_pct", 3.0),
    )
    result = calcul_exploitation(inp)
    scenario.exploitation_result = result.to_dict()
    session.add(scenario)
    session.add(AuditLog(
        action="calcul_exploitation",
        target_type="scenario",
        target_id=scenario_id,
        payload={
            "loyer_eq_m2_mois": result.loyer_equilibre_m2_mois,
            "caf_annee_1": result.caf_annee_1,
            "cumul_tresorerie_fin": result.cumul_tresorerie_fin,
        },
    ))
    session.commit()
    return result.to_dict()
