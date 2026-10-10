"""Notifications in-app par utilisateur."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, desc

from ..db import get_session
from ..models import Notification, User
from ..auth import get_current_user


router = APIRouter()


def _require_auth(user: User | None) -> User:
    if not user:
        raise HTTPException(401, "Authentification requise")
    return user


@router.get("")
def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> dict:
    user = _require_auth(user)
    stmt = select(Notification).where(Notification.destinataire == user.username)
    if unread_only:
        stmt = stmt.where(Notification.lue == False)  # noqa: E712
    stmt = stmt.order_by(desc(Notification.at)).limit(limit)
    rows = list(session.exec(stmt).all())
    unread_count = len(list(session.exec(
        select(Notification)
        .where(Notification.destinataire == user.username)
        .where(Notification.lue == False)  # noqa: E712
    ).all()))
    return {"rows": rows, "unread_count": unread_count}


@router.put("/{notif_id}/read")
def mark_read(
    notif_id: int,
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> Notification:
    user = _require_auth(user)
    n = session.get(Notification, notif_id)
    if not n or n.destinataire != user.username:
        raise HTTPException(404, "Notification introuvable")
    n.lue = True
    session.add(n)
    session.commit()
    session.refresh(n)
    return n


@router.put("/mark-all-read")
def mark_all_read(
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> dict:
    user = _require_auth(user)
    stmt = select(Notification).where(Notification.destinataire == user.username).where(
        Notification.lue == False  # noqa: E712
    )
    count = 0
    for n in session.exec(stmt).all():
        n.lue = True
        session.add(n)
        count += 1
    session.commit()
    return {"ok": True, "marked": count}


@router.post("")
def create_notification(
    body: dict,
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> Notification:
    """Permet à un user d'envoyer une notif ponctuelle (mention, demande de validation…)."""
    user = _require_auth(user)
    n = Notification(
        destinataire=body.get("destinataire"),
        type_notif=body.get("type_notif", "info"),
        titre=body.get("titre", ""),
        message=body.get("message", ""),
        url_action=body.get("url_action"),
        emise_par=user.username,
        target_type=body.get("target_type"),
        target_id=body.get("target_id"),
    )
    session.add(n)
    session.commit()
    session.refresh(n)
    return n
