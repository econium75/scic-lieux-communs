"""Simulateur 8 onglets — lecture, saisie, calcul à la volée et exports par onglet."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Operation, Simulation, Referentiel, AuditLog, User
from ..auth import require_saisie
from ..engines.simulateur import (
    calculer, normaliser, valider, simulation_defaut, appliquer_bareme, prix_revient_depuis_hypotheses,
    BAREME_DEFAUT,
)
from ..excel.simulateur_xlsx import build_simulateur_xlsx, ONGLETS

router = APIRouter()


class SimulationBody(BaseModel):
    data: dict


def get_bareme(session: Session) -> dict:
    r = session.exec(select(Referentiel).where(Referentiel.code == "bareme_reglementaire")).first()
    return r.data if r else BAREME_DEFAUT


def _operation(session: Session, op_id: int) -> Operation:
    op = session.get(Operation, op_id)
    if not op:
        raise HTTPException(404, "Opération non trouvée")
    return op


def get_or_create_simulation(session: Session, op: Operation) -> Simulation:
    sim = session.exec(select(Simulation).where(Simulation.operation_id == op.id)).first()
    if sim:
        return sim
    sim = Simulation(operation_id=op.id, data=simulation_defaut(op.nom, op.commune))
    session.add(sim)
    session.commit()
    session.refresh(sim)
    return sim


def _payload(op: Operation, sim: Simulation, bareme: dict) -> dict:
    data = normaliser(sim.data)
    return {
        "operation_id": op.id,
        "operation": {"id": op.id, "code": op.code, "nom": op.nom, "commune": op.commune},
        "data": data,
        "result": calculer(data, bareme),
        "updated_at": sim.updated_at,
        "updated_by": sim.updated_by,
    }


@router.get("/operation/{op_id}")
def lire(op_id: int, session: Session = Depends(get_session)) -> dict:
    op = _operation(session, op_id)
    sim = get_or_create_simulation(session, op)
    return _payload(op, sim, get_bareme(session))


@router.put("/operation/{op_id}")
def enregistrer(
    op_id: int,
    body: SimulationBody,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> dict:
    op = _operation(session, op_id)
    data = normaliser(body.data)
    erreurs = valider(data)
    if erreurs:
        raise HTTPException(422, " ".join(erreurs))
    sim = get_or_create_simulation(session, op)
    sim.data = data
    sim.updated_at = datetime.now(timezone.utc)
    sim.updated_by = user.username
    session.add(sim)

    # L'opération reflète le programme saisi (liste déroulante, tableau de bord)
    bareme = get_bareme(session)
    res = calculer(data, bareme)
    pp = res["programme"]["par_produit"]
    op.nb_logements_total = res["programme"]["total"]["nb"]
    op.nb_logements_brs = pp["BRS"]["nb"]
    op.nb_logements_pls = pp["PLS"]["nb"]
    op.nb_logements_pli = pp["PLI"]["nb"]
    op.nb_logements_pluspai = pp["PLUS"]["nb"] + pp["PLAI"]["nb"]
    op.surface_habitable_m2 = round(res["programme"]["total"]["shab"], 2)
    h = data["hypotheses"]
    if h.get("annee_livraison"):
        op.livraison_cible = str(h["annee_livraison"])
    op.updated_at = datetime.now(timezone.utc)
    session.add(op)
    session.add(AuditLog(
        action="simulation_update", target_type="operation", target_id=op.id, user=user.username,
        payload={
            "prix_revient_ttc": round(res["prix_revient"]["ttc"]["total"], 2),
            "emprunt_equilibre": round(res["financement"]["emprunt_equilibre"]["total"], 2),
            "nb_logements": res["programme"]["total"]["nb"],
        },
    ))
    session.commit()
    session.refresh(sim)
    session.refresh(op)
    return {
        "operation_id": op.id,
        "operation": {"id": op.id, "code": op.code, "nom": op.nom, "commune": op.commune},
        "data": data,
        "result": res,
        "updated_at": sim.updated_at,
        "updated_by": sim.updated_by,
    }


@router.post("/operation/{op_id}/calcul")
def calcul(op_id: int, body: SimulationBody, session: Session = Depends(get_session)) -> dict:
    """Calcule sans enregistrer (aperçu en direct pendant la saisie)."""
    _operation(session, op_id)
    return calculer(body.data, get_bareme(session))


@router.post("/operation/{op_id}/appliquer-bareme")
def bareme_vers_hypotheses(op_id: int, body: SimulationBody, session: Session = Depends(get_session)) -> dict:
    _operation(session, op_id)
    return {"data": appliquer_bareme(body.data, get_bareme(session))}


@router.post("/operation/{op_id}/prefill-prix-revient")
def prefill_prix_revient(op_id: int, body: SimulationBody, session: Session = Depends(get_session)) -> dict:
    _operation(session, op_id)
    return {"data": prix_revient_depuis_hypotheses(body.data)}


@router.get("/operation/{op_id}/export/{onglet}")
def exporter(op_id: int, onglet: str, session: Session = Depends(get_session)):
    if onglet != "complet" and onglet not in ONGLETS:
        raise HTTPException(404, f"Onglet inconnu : {onglet}")
    op = _operation(session, op_id)
    sim = get_or_create_simulation(session, op)
    data = normaliser(sim.data)
    res = calculer(data, get_bareme(session))
    buf = build_simulateur_xlsx(data, res, onglet)
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", op.code or f"op{op.id}")
    nom = f"simulateur_{slug}_{onglet}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nom}"'},
    )


def seed_simulations() -> None:
    """Crée une simulation pour chaque opération qui n'en a pas (ECON'HOME pour Orly)."""
    from ..db import engine
    from ..simulateur_seed import simulation_econhome
    with Session(engine) as session:
        for op in session.exec(select(Operation)).all():
            exists = session.exec(select(Simulation).where(Simulation.operation_id == op.id)).first()
            if exists:
                continue
            data = simulation_econhome() if op.code == "ORLY-ECO-2027" else simulation_defaut(op.nom, op.commune)
            session.add(Simulation(operation_id=op.id, data=data, updated_by="system"))
        session.commit()
