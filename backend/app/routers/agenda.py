"""Agenda partagé — événements calendrier."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from pydantic import BaseModel

from ..db import get_session
from ..models import EventAgenda, Notification, AuditLog, User
from ..auth import require_saisie, get_current_user


router = APIRouter()


class EventCreate(BaseModel):
    titre: str
    description: str = ""
    debut: datetime
    fin: datetime | None = None
    toute_journee: bool = False
    type_event: str = "rdv"
    operation_id: int | None = None
    phase_id: int | None = None
    participants: list[str] = []
    lieu: str = ""


class EventUpdate(BaseModel):
    titre: str | None = None
    description: str | None = None
    debut: datetime | None = None
    fin: datetime | None = None
    toute_journee: bool | None = None
    type_event: str | None = None
    operation_id: int | None = None
    phase_id: int | None = None
    participants: list[str] | None = None
    lieu: str | None = None


@router.get("")
def list_events(
    debut: datetime | None = Query(default=None),
    fin: datetime | None = Query(default=None),
    operation_id: int | None = None,
    session: Session = Depends(get_session),
) -> list[EventAgenda]:
    stmt = select(EventAgenda)
    if debut:
        stmt = stmt.where(EventAgenda.debut >= debut)
    if fin:
        stmt = stmt.where(EventAgenda.debut <= fin)
    if operation_id is not None:
        stmt = stmt.where(EventAgenda.operation_id == operation_id)
    stmt = stmt.order_by(EventAgenda.debut)
    return list(session.exec(stmt).all())


@router.post("")
def create_event(
    body: EventCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> EventAgenda:
    e = EventAgenda(**body.model_dump(), organisateur=user.username)
    session.add(e)
    session.commit()
    session.refresh(e)
    # Notifier les participants
    for p in body.participants:
        if p == user.username:
            continue
        session.add(Notification(
            destinataire=p,
            type_notif="info",
            titre=f"Invitation : {e.titre}",
            message=f"Le {e.debut.strftime('%d/%m/%Y %H:%M')} — {e.lieu or 'lieu à préciser'}",
            url_action="/agenda",
            emise_par=user.username,
            target_type="event",
            target_id=e.id,
        ))
    session.add(AuditLog(
        action="event_create", target_type="event", target_id=e.id,
        user=user.username, payload={"titre": e.titre, "debut": e.debut.isoformat()},
    ))
    session.commit()
    session.refresh(e)
    return e


@router.put("/{event_id}")
def update_event(
    event_id: int,
    body: EventUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> EventAgenda:
    e = session.get(EventAgenda, event_id)
    if not e:
        raise HTTPException(404, "Événement introuvable")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(e, k, v)
    session.add(e)
    session.commit()
    session.refresh(e)
    return e


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> dict:
    e = session.get(EventAgenda, event_id)
    if not e:
        raise HTTPException(404, "Événement introuvable")
    session.delete(e)
    session.commit()
    return {"ok": True}
