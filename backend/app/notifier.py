"""Création des notifications in-app (cloche) — point unique pour tâches, documents et agenda."""
from sqlmodel import Session

from .models import Notification


def notifier(
    session: Session,
    destinataire: str,
    titre: str,
    message: str = "",
    *,
    type_notif: str = "info",
    url: str | None = None,
    emise_par: str = "system",
    target_type: str | None = None,
    target_id: int | None = None,
) -> None:
    """Ajoute une notification à la session (le commit reste à la charge de l'appelant).
    On ne se notifie pas soi-même."""
    if not destinataire or destinataire == emise_par:
        return
    session.add(Notification(
        destinataire=destinataire,
        type_notif=type_notif,
        titre=titre[:200],
        message=message[:500],
        url_action=url,
        emise_par=emise_par,
        target_type=target_type,
        target_id=target_id,
    ))
