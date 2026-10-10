"""M6 Exports — Excel formatés + PDF synthèse."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from ..db import get_session
from ..models import Scenario, Menage, AuditLog
from ..engines.bilan import calcul_bilan_operation, BilanInput, LigneSaisie, Vente, SubventionGlobale
from ..engines.exploitation import calcul_exploitation, ExploitationInput, Pret, Composant
from ..engines.commercialisation import calcul_qualification, MenageInput, CompositionFamille
from ..excel.bilan_recap import build_bilan_recap
from ..excel.exploitation_pls import build_exploitation_pls
from ..excel.commercialisation import build_commercialisation
from ..excel.pdf_synthese import build_pdf_synthese

router = APIRouter()


def _xlsx_response(buf, filename: str) -> StreamingResponse:
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(buf, filename: str) -> StreamingResponse:
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _compute_bilan(scenario: Scenario) -> dict:
    op = scenario.operation
    hyp = scenario.hypotheses or {}
    lignes = [LigneSaisie(**l) for l in hyp.get("lignes", [])]
    ventes = [Vente(**v) for v in hyp.get("ventes", [])]
    subv = [SubventionGlobale(**s) for s in hyp.get("subventions", [])]
    inp = BilanInput(
        operation_code=op.code, nom=op.nom, commune=op.commune,
        zone_brs=op.zone_brs, livraison_cible=op.livraison_cible,
        lignes=lignes, ventes=ventes, subventions=subv,
    )
    return calcul_bilan_operation(inp).to_dict()


def _compute_exploit(scenario: Scenario) -> dict | None:
    op = scenario.operation
    hyp = (scenario.hypotheses or {}).get("exploitation")
    if not hyp:
        return None
    prets = [Pret(**p) for p in hyp.get("prets", [])]
    composants = [Composant(**c) for c in hyp.get("composants", [])]
    inp = ExploitationInput(
        operation_code=op.code, nom=op.nom,
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
        prets=prets, composants=composants,
        prix_de_revient=hyp.get("prix_de_revient", 0),
        fonds_propres=hyp.get("fonds_propres", 0),
        taux_actualisation_pct=hyp.get("taux_actualisation_pct", 3.0),
    )
    return calcul_exploitation(inp).to_dict()


@router.get("/bilan/{scenario_id}.xlsx")
def export_bilan_xlsx(scenario_id: int, session: Session = Depends(get_session)):
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    bilan = _compute_bilan(sc)
    buf = build_bilan_recap(bilan)
    session.add(AuditLog(action="export_bilan_xlsx", target_type="scenario", target_id=scenario_id))
    session.commit()
    return _xlsx_response(buf, f"bilan_{bilan['operation_code']}.xlsx")


@router.get("/exploitation/{scenario_id}.xlsx")
def export_exploitation_xlsx(scenario_id: int, session: Session = Depends(get_session)):
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    exploit = _compute_exploit(sc)
    if not exploit:
        raise HTTPException(400, "Hypothèses d'exploitation absentes")
    buf = build_exploitation_pls(exploit)
    session.add(AuditLog(action="export_exploitation_xlsx", target_type="scenario", target_id=scenario_id))
    session.commit()
    return _xlsx_response(buf, f"exploitation_{exploit['operation_code']}.xlsx")


@router.get("/commercialisation/{scenario_id}.xlsx")
def export_commercialisation_xlsx(scenario_id: int, session: Session = Depends(get_session)):
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")

    menages = session.exec(select(Menage).where(Menage.scenario_id == scenario_id)).all()
    rows = []
    for m in menages:
        adultes = max(1, m.nb_personnes - m.nb_enfants)
        comp = CompositionFamille(
            adultes=adultes,
            enfants_moins_14=m.nb_enfants,
            enfants_14_plus=0,
        )
        inp = MenageInput(
            reference=m.reference,
            typologie_logement=m.typologie_logement,
            composition=comp,
            revenu_activites_annuel=m.revenu_fiscal_annuel,
            revenus_patrimoine_annuel=0.0,
            prestations_sociales_annuel=m.prestations_sociales_mensuelles * 12,
            apport=m.apport,
        )
        qual = calcul_qualification(inp).to_dict()
        rows.append({"menage": m.model_dump(), "qualification": qual})
    buf = build_commercialisation(rows)
    session.add(AuditLog(action="export_commercialisation_xlsx", target_type="scenario", target_id=scenario_id,
                        payload={"nb_menages": len(rows)}))
    session.commit()
    return _xlsx_response(buf, f"commercialisation_{sc.operation.code}.xlsx")


@router.get("/synthese/{scenario_id}.pdf")
def export_synthese_pdf(scenario_id: int, session: Session = Depends(get_session)):
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    bilan = _compute_bilan(sc)
    exploit = _compute_exploit(sc)
    buf = build_pdf_synthese(bilan, exploit, sc.nom)
    session.add(AuditLog(action="export_synthese_pdf", target_type="scenario", target_id=scenario_id))
    session.commit()
    return _pdf_response(buf, f"synthese_{bilan['operation_code']}.pdf")


@router.get("/operation/{operation_id}.zip")
def export_operation_zip(operation_id: int, session: Session = Depends(get_session)):
    """Zip complet d'une opération : tous les Excel + PDF des scénarios + pièces jointes."""
    import zipfile
    from io import BytesIO
    from ..models import Operation, Attachment, Menage
    from ..excel.commercialisation import build_commercialisation
    from ..engines.commercialisation import calcul_qualification, MenageInput, CompositionFamille
    from ..config import settings as _s

    op = session.get(Operation, operation_id)
    if not op:
        raise HTTPException(404, "Opération introuvable")

    scenarios = list(session.exec(select(Scenario).where(Scenario.operation_id == operation_id)).all())
    if not scenarios:
        raise HTTPException(404, "Aucun scénario pour cette opération")

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # README dans le ZIP
        from datetime import datetime as _dt
        readme = (
            f"Export opération {op.nom}\n"
            f"Code : {op.code}\n"
            f"Commune : {op.commune}\n"
            f"Généré le : {_dt.utcnow().isoformat()}Z\n"
            f"Scénarios inclus : {len(scenarios)}\n\n"
            f"Contenu :\n"
            f"- scenarios/<id>_<nom>/bilan.xlsx — bilan M2\n"
            f"- scenarios/<id>_<nom>/exploitation.xlsx — exploitation M3 (si configurée)\n"
            f"- scenarios/<id>_<nom>/commercialisation.xlsx — ménages M4\n"
            f"- scenarios/<id>_<nom>/synthese.pdf — PDF de synthèse comité d'engagement\n"
            f"- pieces_jointes/ — toutes les pièces jointes de l'opération et ses phases\n"
        )
        zf.writestr("README.txt", readme)

        for sc in scenarios:
            folder = f"scenarios/{sc.id}_{sc.nom.replace(' ', '_').replace('/', '_')[:40]}"
            try:
                bilan = _compute_bilan(sc)
                zf.writestr(f"{folder}/bilan.xlsx", build_bilan_recap(bilan).getvalue())
            except Exception as e:
                zf.writestr(f"{folder}/bilan_ERREUR.txt", f"{e}")
            try:
                exploit = _compute_exploit(sc)
                if exploit:
                    zf.writestr(f"{folder}/exploitation.xlsx", build_exploitation_pls(exploit).getvalue())
            except Exception as e:
                zf.writestr(f"{folder}/exploitation_ERREUR.txt", f"{e}")
            # Commercialisation
            try:
                menages = list(session.exec(select(Menage).where(Menage.scenario_id == sc.id)).all())
                if menages:
                    rows = []
                    for m in menages:
                        adultes = max(1, m.nb_personnes - m.nb_enfants)
                        comp = CompositionFamille(adultes=adultes, enfants_moins_14=m.nb_enfants, enfants_14_plus=0)
                        inp = MenageInput(
                            reference=m.reference, typologie_logement=m.typologie_logement,
                            composition=comp, revenu_activites_annuel=m.revenu_fiscal_annuel,
                            revenus_patrimoine_annuel=0.0,
                            prestations_sociales_annuel=m.prestations_sociales_mensuelles * 12,
                            apport=m.apport,
                        )
                        rows.append({"menage": m.model_dump(), "qualification": calcul_qualification(inp).to_dict()})
                    zf.writestr(f"{folder}/commercialisation.xlsx", build_commercialisation(rows).getvalue())
            except Exception as e:
                zf.writestr(f"{folder}/commercialisation_ERREUR.txt", f"{e}")
            # PDF synthèse
            try:
                exploit = _compute_exploit(sc)
                zf.writestr(f"{folder}/synthese.pdf", build_pdf_synthese(_compute_bilan(sc), exploit, sc.nom).getvalue())
            except Exception as e:
                zf.writestr(f"{folder}/synthese_ERREUR.txt", f"{e}")

        # Pièces jointes de l'opération et ses phases
        attachments_dir = _s.data_dir / "attachments"
        atts = list(session.exec(
            select(Attachment).where(
                ((Attachment.parent_type == "operation") & (Attachment.parent_id == operation_id))
                | ((Attachment.parent_type == "scenario") & (Attachment.parent_id.in_([s.id for s in scenarios])))  # type: ignore
            )
        ).all())
        for att in atts:
            src = attachments_dir / att.stored_path
            if src.exists():
                arcname = f"pieces_jointes/{att.parent_type}_{att.parent_id}_{att.filename}"
                try:
                    zf.write(str(src), arcname=arcname)
                except Exception:
                    pass

    buf.seek(0)
    session.add(AuditLog(action="export_operation_zip", target_type="operation", target_id=operation_id))
    session.commit()
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="operation_{op.code}.zip"'},
    )
