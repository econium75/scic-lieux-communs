"""Suivi de projet par phases."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel

from ..db import get_session
from ..models import Phase, Notification, AuditLog, User
from ..auth import get_current_user, require_saisie


router = APIRouter()


PHASES_DEFAUT = [
    "Incubation",
    "Cadrage",
    "Montage financier",
    "Instruction permis",
    "Chantier VEFA",
    "Livraison",
    "Exploitation",
    "Clôture",
]


class PhaseCreate(BaseModel):
    operation_id: int
    nom: str
    ordre: int = 0
    statut: str = "a_faire"
    date_cible: datetime | None = None
    responsable: str = ""


class PhaseUpdate(BaseModel):
    nom: str | None = None
    statut: str | None = None
    date_cible: datetime | None = None
    date_realisation: datetime | None = None
    responsable: str | None = None
    notes: str | None = None


@router.get("/operation/{operation_id}")
def list_phases(operation_id: int, session: Session = Depends(get_session)) -> list[Phase]:
    stmt = select(Phase).where(Phase.operation_id == operation_id).order_by(Phase.ordre)
    return list(session.exec(stmt).all())


@router.post("/operation/{operation_id}/init")
def init_phases_default(
    operation_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> list[Phase]:
    """Crée les 8 phases par défaut pour une opération."""
    existing = session.exec(select(Phase).where(Phase.operation_id == operation_id)).first()
    if existing:
        raise HTTPException(400, "Les phases existent déjà pour cette opération")
    for i, nom in enumerate(PHASES_DEFAUT):
        session.add(Phase(operation_id=operation_id, nom=nom, ordre=i, statut="a_faire"))
    session.commit()
    stmt = select(Phase).where(Phase.operation_id == operation_id).order_by(Phase.ordre)
    return list(session.exec(stmt).all())


@router.post("")
def create_phase(
    body: PhaseCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> Phase:
    p = Phase(**body.model_dump())
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


@router.put("/{phase_id}")
def update_phase(
    phase_id: int,
    body: PhaseUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> Phase:
    p = session.get(Phase, phase_id)
    if not p:
        raise HTTPException(404, "Phase introuvable")
    changes = body.model_dump(exclude_none=True)
    for k, v in changes.items():
        setattr(p, k, v)
    p.updated_at = datetime.now(timezone.utc)
    session.add(p)
    # Notifier le responsable si le statut change
    if "statut" in changes and p.responsable and p.responsable != user.username:
        session.add(Notification(
            destinataire=p.responsable,
            type_notif="validation" if changes["statut"] == "termine" else "info",
            titre=f"Phase « {p.nom} » : statut changé",
            message=f"Nouveau statut : {changes['statut']} (opération #{p.operation_id})",
            url_action=f"/operations/{p.operation_id}",
            emise_par=user.username,
            target_type="phase",
            target_id=phase_id,
        ))
    session.add(AuditLog(
        action="phase_update", target_type="phase", target_id=phase_id,
        user=user.username, payload=changes,
    ))
    session.commit()
    session.refresh(p)
    return p


@router.delete("/{phase_id}")
def delete_phase(
    phase_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> dict:
    p = session.get(Phase, phase_id)
    if not p:
        raise HTTPException(404, "Phase introuvable")
    session.delete(p)
    session.commit()
    return {"ok": True}
