"""Agenda partagé — événements calendrier."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlmodel import Session, select
from pydantic import BaseModel

from ..db import get_session
from ..models import EventAgenda, Notification, AuditLog, User
from ..auth import require_saisie, get_current_user
from ..notifier import notifier


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
            url_action=f"/agenda?date={e.debut.date().isoformat()}",
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
    avant = set(e.participants or [])
    date_avant = e.debut
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(e, k, v)
    session.add(e)
    def _naif(d: datetime) -> datetime:
        return d.astimezone(timezone.utc).replace(tzinfo=None) if d.tzinfo else d

    deplace = _naif(e.debut) != _naif(date_avant)
    quand = e.debut.strftime("%d/%m/%Y %H:%M")
    for p in e.participants or []:
        if p in avant and not deplace:
            continue
        titre = f"Invitation : {e.titre}" if p not in avant else f"Événement déplacé : {e.titre}"
        notifier(session, p, titre, f"Le {quand} UTC — {e.lieu or 'lieu à préciser'}", url=f"/agenda?date={e.debut.date().isoformat()}",
                 emise_par=user.username, target_type="event", target_id=e.id)
    session.add(AuditLog(action="event_update", target_type="event", target_id=e.id, user=user.username,
                         payload={"titre": e.titre, "debut": e.debut.isoformat()}))
    session.commit()
    session.refresh(e)
    return e


def _ics_echap(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@router.get("/export.ics")
def export_ics(
    operation_id: int | None = None,
    session: Session = Depends(get_session),
):
    """Export iCalendar (Outlook, Google Agenda, Thunderbird…) de tous les événements."""
    stmt = select(EventAgenda).order_by(EventAgenda.debut)
    if operation_id is not None:
        stmt = stmt.where(EventAgenda.operation_id == operation_id)
    fmt = lambda d: d.strftime("%Y%m%dT%H%M%SZ")  # noqa: E731  (dates stockées en UTC)
    lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Téo//Agenda partagé//FR", "CALSCALE:GREGORIAN"]
    for e in session.exec(stmt).all():
        fin = e.fin or (e.debut + timedelta(hours=1))
        lignes += ["BEGIN:VEVENT", f"UID:scic-event-{e.id}@lieux-communs", f"DTSTAMP:{fmt(e.created_at)}"]
        if e.toute_journee:
            lignes += [f"DTSTART;VALUE=DATE:{e.debut.strftime('%Y%m%d')}",
                       f"DTEND;VALUE=DATE:{(e.debut + timedelta(days=1)).strftime('%Y%m%d')}"]
        else:
            lignes += [f"DTSTART:{fmt(e.debut)}", f"DTEND:{fmt(fin)}"]
        lignes += [f"SUMMARY:{_ics_echap(e.titre)}", f"DESCRIPTION:{_ics_echap(e.description)}",
                   f"LOCATION:{_ics_echap(e.lieu)}", f"CATEGORIES:{e.type_event.upper()}", "END:VEVENT"]
    lignes.append("END:VCALENDAR")
    return Response("\r\n".join(lignes) + "\r\n", media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="agenda_lieux_communs.ics"'})


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
