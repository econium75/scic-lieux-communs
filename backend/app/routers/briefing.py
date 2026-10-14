"""Briefing quotidien personnalisé — texte généré depuis l'activité du jour + audio gTTS."""
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel import Session, select, desc

from ..config import settings
from ..db import get_session
from ..models import Briefing, Notification, EventAgenda, AuditLog, Phase, Scenario, Operation, User
from ..auth import get_current_user


router = APIRouter()

BRIEFINGS_DIR = settings.data_dir / "briefings"
BRIEFINGS_DIR.mkdir(parents=True, exist_ok=True)


def _require_auth(user: User | None) -> User:
    if not user:
        raise HTTPException(401, "Authentification requise")
    return user


def _build_script(session: Session, user: User, jour: date) -> tuple[str, str]:
    """Construit le script du briefing. Retourne (titre, texte)."""
    debut = datetime(jour.year, jour.month, jour.day, 0, 0, tzinfo=timezone.utc)
    fin = debut + timedelta(days=1)

    # Événements du jour impliquant l'utilisateur
    events_today = list(session.exec(
        select(EventAgenda).where(EventAgenda.debut >= debut).where(EventAgenda.debut < fin)
        .order_by(EventAgenda.debut)
    ).all())
    events_user = [e for e in events_today if user.username in (e.participants or []) or e.organisateur == user.username]

    # Notifications non lues
    notifs_unread = list(session.exec(
        select(Notification).where(Notification.destinataire == user.username)
        .where(Notification.lue == False)  # noqa: E712
        .order_by(desc(Notification.at)).limit(20)
    ).all())

    # Phases dont user est responsable + statut en_cours ou bloqué
    phases_resp = list(session.exec(
        select(Phase).where(Phase.responsable == user.username)
        .where(Phase.statut.in_(["en_cours", "bloque"]))  # type: ignore
    ).all())

    # Opérations existantes (contexte global)
    operations = list(session.exec(select(Operation)).all())

    # Audit récent sur objets concernant l'utilisateur
    hier = debut - timedelta(days=1)
    audit_hier = list(session.exec(
        select(AuditLog).where(AuditLog.at >= hier).where(AuditLog.at < debut)
        .order_by(desc(AuditLog.at)).limit(10)
    ).all())

    # Rédaction naturelle du script
    nom = user.nom_affichage or user.username
    today_fr = jour.strftime("%A %d %B %Y").replace("Monday", "lundi").replace("Tuesday", "mardi") \
        .replace("Wednesday", "mercredi").replace("Thursday", "jeudi").replace("Friday", "vendredi") \
        .replace("Saturday", "samedi").replace("Sunday", "dimanche") \
        .replace("January", "janvier").replace("February", "février").replace("March", "mars") \
        .replace("April", "avril").replace("May", "mai").replace("June", "juin") \
        .replace("July", "juillet").replace("August", "août").replace("September", "septembre") \
        .replace("October", "octobre").replace("November", "novembre").replace("December", "décembre")

    parts: list[str] = []
    parts.append(f"Bonjour {nom}, voici votre briefing du {today_fr}.")

    if events_user:
        parts.append(f"Vous avez {len(events_user)} rendez-vous aujourd'hui.")
        for e in events_user[:5]:
            h = e.debut.astimezone(timezone.utc).strftime("%Hh%M")
            lieu = f" au {e.lieu}" if e.lieu else ""
            parts.append(f"À {h}, {e.titre}{lieu}.")
    else:
        parts.append("Aucun rendez-vous programmé dans votre agenda aujourd'hui.")

    if notifs_unread:
        parts.append(f"Vous avez {len(notifs_unread)} notification{'s' if len(notifs_unread) > 1 else ''} non lue{'s' if len(notifs_unread) > 1 else ''}.")
        for n in notifs_unread[:3]:
            parts.append(f"{n.titre}.")

    # Tâches reçues à traiter
    from ..models import Tache
    taches = list(session.exec(
        select(Tache).where(Tache.destinataire == user.username).where(Tache.statut == "a_faire")
    ).all())
    if taches:
        en_retard = [t for t in taches if t.echeance and t.echeance.replace(tzinfo=timezone.utc) < debut]
        a_signer = [t for t in taches if t.type_tache == "signature"]
        phrase = f"Vous avez {len(taches)} tâche{'s' if len(taches) > 1 else ''} à traiter"
        if en_retard:
            phrase += f", dont {len(en_retard)} en retard"
        parts.append(phrase + ".")
        if a_signer:
            parts.append(f"{len(a_signer)} document{'s' if len(a_signer) > 1 else ''} attend{'ent' if len(a_signer) > 1 else ''} votre signature.")
        for t in sorted(taches, key=lambda x: x.echeance or datetime.max)[:3]:
            ech = f", à rendre le {t.echeance.strftime('%d/%m')}" if t.echeance else ""
            parts.append(f"{t.type_tache.capitalize()} demandée par {t.emetteur} : {t.titre}{ech}.")

    if phases_resp:
        parts.append(f"En tant que responsable, vous suivez {len(phases_resp)} phase{'s' if len(phases_resp) > 1 else ''} actuellement.")
        for p in phases_resp[:3]:
            op = session.get(Operation, p.operation_id)
            op_nom = op.nom if op else f"opération {p.operation_id}"
            etat = "en cours" if p.statut == "en_cours" else "bloquée"
            parts.append(f"Phase {p.nom} de l'opération {op_nom}, {etat}.")

    if audit_hier:
        parts.append(f"Hier, {len(audit_hier)} actions ont été enregistrées dans le journal d'audit.")
        actions_count: dict[str, int] = {}
        for a in audit_hier:
            actions_count[a.action] = actions_count.get(a.action, 0) + 1
        top = sorted(actions_count.items(), key=lambda x: -x[1])[:3]
        for act, n in top:
            label = act.replace("_", " ")
            parts.append(f"{n} {label}.")

    # Rappel métier basé sur les opérations
    if operations:
        for op in operations[:1]:
            parts.append(f"Rappel sur l'opération {op.nom} : {op.nb_logements_total} logements, livraison prévue {op.livraison_cible}.")

    parts.append("Bonne journée, et à demain pour le prochain briefing.")

    texte = " ".join(parts)
    titre = f"Briefing {jour.isoformat()} — {nom}"
    return titre, texte


def _generate_audio(texte: str, out_path: Path) -> bool:
    """Génère un MP3 à partir du texte via gTTS. Retourne True si succès."""
    try:
        from gtts import gTTS
        tts = gTTS(text=texte, lang="fr", slow=False)
        tts.save(str(out_path))
        return True
    except Exception as e:
        print(f"[briefing] gTTS failed: {e}")
        return False


@router.post("/generer")
def generer_briefing(
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> Briefing:
    """Génère (ou régénère) le briefing du jour pour l'utilisateur connecté."""
    user = _require_auth(user)
    jour = date.today()
    jour_str = jour.isoformat()

    # Supprimer l'existant du jour
    existing = session.exec(
        select(Briefing).where(Briefing.destinataire == user.username).where(Briefing.jour == jour_str)
    ).first()
    if existing:
        if existing.audio_path:
            try:
                (BRIEFINGS_DIR / Path(existing.audio_path).name).unlink(missing_ok=True)
            except Exception:
                pass
        session.delete(existing)
        session.commit()

    titre, texte = _build_script(session, user, jour)

    audio_file = f"briefing_{user.username}_{jour_str}.mp3"
    audio_path = BRIEFINGS_DIR / audio_file
    audio_ok = _generate_audio(texte, audio_path)

    # Estimation durée ~140 mots/min en français
    mots = len(texte.split())
    duree = int(mots / 140 * 60)

    b = Briefing(
        destinataire=user.username,
        jour=jour_str,
        titre=titre,
        script_texte=texte,
        audio_path=audio_file if audio_ok else None,
        duree_estimee_sec=duree,
    )
    session.add(b)
    session.add(AuditLog(
        action="briefing_generer", target_type="briefing", target_id=b.id,
        user=user.username, payload={"jour": jour_str, "audio": audio_ok, "mots": mots},
    ))
    session.commit()
    session.refresh(b)
    return b


@router.get("/aujourd-hui")
def get_briefing_today(
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> Briefing | None:
    user = _require_auth(user)
    jour = date.today().isoformat()
    b = session.exec(
        select(Briefing).where(Briefing.destinataire == user.username).where(Briefing.jour == jour)
    ).first()
    return b


@router.get("/historique")
def list_historique(
    limit: int = 14,
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> list[Briefing]:
    user = _require_auth(user)
    stmt = (
        select(Briefing)
        .where(Briefing.destinataire == user.username)
        .order_by(desc(Briefing.jour))
        .limit(limit)
    )
    return list(session.exec(stmt).all())


@router.get("/{briefing_id}/audio")
def get_audio(
    briefing_id: int,
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
):
    user = _require_auth(user)
    b = session.get(Briefing, briefing_id)
    if not b or b.destinataire != user.username:
        raise HTTPException(404, "Briefing introuvable")
    if not b.audio_path:
        raise HTTPException(404, "Audio non disponible pour ce briefing")
    path = BRIEFINGS_DIR / b.audio_path
    if not path.exists():
        raise HTTPException(404, "Fichier audio manquant sur disque")
    # marquer comme lu
    b.lu = True
    session.add(b)
    session.commit()
    return FileResponse(str(path), media_type="audio/mpeg", filename=b.audio_path)
