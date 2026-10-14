"""Opérations immobilières — CRUD complet."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Operation, Scenario, Phase, AuditLog, User, Simulation, TacheProjet
from ..auth import get_current_user, require_saisie, require_admin
from ..engines.simulateur import simulation_defaut, ZONES_123, ZONES_ABC
from pydantic import BaseModel

router = APIRouter()


class OperationCreate(BaseModel):
    code: str
    nom: str
    commune: str
    zone_brs: str = "1bis"
    nb_logements_total: int = 0
    nb_logements_brs: int = 0
    nb_logements_pls: int = 0
    nb_logements_pli: int = 0
    nb_logements_pluspai: int = 0
    surface_habitable_m2: float = 0.0
    livraison_cible: str = "T4 2027"
    # Initialisation du simulateur
    zone_123: str = "Z1"
    zone_abc: str = "A"
    annee_livraison: int | None = None


class OperationUpdate(BaseModel):
    code: str | None = None
    nom: str | None = None
    commune: str | None = None
    zone_brs: str | None = None
    nb_logements_total: int | None = None
    nb_logements_brs: int | None = None
    nb_logements_pls: int | None = None
    nb_logements_pli: int | None = None
    nb_logements_pluspai: int | None = None
    surface_habitable_m2: float | None = None
    livraison_cible: str | None = None


@router.get("")
def list_operations(session: Session = Depends(get_session)) -> list[Operation]:
    return list(session.exec(select(Operation).order_by(Operation.nom)).all())


@router.get("/{operation_id}")
def get_operation(operation_id: int, session: Session = Depends(get_session)) -> Operation:
    op = session.get(Operation, operation_id)
    if not op:
        raise HTTPException(404, "Opération non trouvée")
    return op


@router.get("/{operation_id}/scenarios")
def list_scenarios(operation_id: int, session: Session = Depends(get_session)) -> list[Scenario]:
    stmt = select(Scenario).where(Scenario.operation_id == operation_id)
    return list(session.exec(stmt).all())


@router.post("")
def create_operation(
    body: OperationCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> Operation:
    # Garde-fou : code unique
    exists = session.exec(select(Operation).where(Operation.code == body.code)).first()
    if exists:
        raise HTTPException(409, f"Code {body.code} déjà utilisé")
    if body.zone_123 not in ZONES_123 or body.zone_abc not in ZONES_ABC:
        raise HTTPException(422, "Zone inconnue")
    champs = body.model_dump(exclude={"zone_123", "zone_abc", "annee_livraison"})
    if body.annee_livraison:
        champs["livraison_cible"] = str(body.annee_livraison)
    op = Operation(**champs)
    session.add(op)
    session.commit()
    session.refresh(op)
    session.add(Simulation(
        operation_id=op.id,
        data=simulation_defaut(op.nom, op.commune, body.zone_123, body.zone_abc, body.annee_livraison),
        updated_by=user.username,
    ))
    # Scénario de référence par défaut
    scenario = Scenario(
        operation_id=op.id,
        nom="Scénario de référence",
        is_reference=True,
        hypotheses={"lignes": [], "ventes": [], "subventions": []},
    )
    session.add(scenario)
    session.add(AuditLog(
        action="operation_create", target_type="operation", target_id=op.id,
        user=user.username, payload={"code": op.code, "nom": op.nom},
    ))
    session.commit()
    session.refresh(op)
    return op


@router.put("/{operation_id}")
def update_operation(
    operation_id: int,
    body: OperationUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> Operation:
    op = session.get(Operation, operation_id)
    if not op:
        raise HTTPException(404, "Opération non trouvée")
    changes = body.model_dump(exclude_none=True)
    for k, v in changes.items():
        setattr(op, k, v)
    op.updated_at = datetime.now(timezone.utc)
    session.add(op)
    session.add(AuditLog(
        action="operation_update", target_type="operation", target_id=op.id,
        user=user.username, payload=changes,
    ))
    session.commit()
    session.refresh(op)
    return op


@router.delete("/{operation_id}")
def delete_operation(
    operation_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
) -> dict:
    op = session.get(Operation, operation_id)
    if not op:
        raise HTTPException(404, "Opération non trouvée")
    # Cascade : supprimer scénarios, phases, et audit log cette suppression
    for sc in session.exec(select(Scenario).where(Scenario.operation_id == operation_id)).all():
        session.delete(sc)
    for p in session.exec(select(Phase).where(Phase.operation_id == operation_id)).all():
        session.delete(p)
    for s in session.exec(select(Simulation).where(Simulation.operation_id == operation_id)).all():
        session.delete(s)
    for t in session.exec(select(TacheProjet).where(TacheProjet.operation_id == operation_id)).all():
        session.delete(t)
    code_sauve = op.code
    session.delete(op)
    session.add(AuditLog(
        action="operation_delete", target_type="operation", target_id=operation_id,
        user=user.username, payload={"code": code_sauve, "nom": op.nom},
    ))
    session.commit()
    return {"ok": True}
