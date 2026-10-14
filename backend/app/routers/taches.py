"""Tâches entre utilisateurs : validation, consultation, signature — avec notifications à chaque étape."""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, desc, select

from ..auth import get_current_user
from ..db import get_session
from ..models import AuditLog, Document, Operation, SignatureDocument, Tache, User
from ..notifier import notifier

router = APIRouter()

TYPES = {"validation": "Validation", "consultation": "Consultation", "signature": "Signature", "autre": "Tâche"}
REPONSES = {
    "validation": {"validee", "refusee"},
    "consultation": {"consultee"},
    "signature": {"signee", "refusee"},
    "autre": {"faite", "refusee"},
}
VERBES = {"validee": "a validé", "refusee": "a refusé", "consultee": "a consulté", "signee": "a signé", "faite": "a terminé"}
PRIORITES = {"normale", "haute", "urgente"}


def _auth(user: User | None) -> User:
    if not user or not user.actif:
        raise HTTPException(401, "Authentification requise")
    return user


def _utc(d: datetime | None) -> datetime | None:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _noms(session: Session) -> dict[str, str]:
    return {u.username: (u.nom_affichage or u.username) for u in session.exec(select(User)).all()}


def _vue(t: Tache, noms: dict[str, str], session: Session) -> dict:
    maintenant = datetime.now(timezone.utc)
    ech = _utc(t.echeance)
    doc = session.get(Document, t.document_id) if t.document_id else None
    op = session.get(Operation, t.operation_id) if t.operation_id else None
    return {
        **t.model_dump(),
        "emetteur_nom": noms.get(t.emetteur, t.emetteur),
        "destinataire_nom": noms.get(t.destinataire, t.destinataire),
        "en_retard": t.statut == "a_faire" and ech is not None and ech < maintenant,
        "document_titre": doc.titre if doc else None,
        "document_est_pdf": bool(doc and doc.mimetype == "application/pdf"),
        "operation_nom": op.nom if op else None,
    }


def _libelle(t: Tache) -> str:
    return f"{TYPES.get(t.type_tache, 'Tâche')} : {t.titre}"


def cloturer(session: Session, t: Tache, user: User, reponse: str, commentaire: str = "") -> Tache:
    """Clôture une tâche et notifie l'émetteur (utilisé aussi par la signature d'un document)."""
    maintenant = datetime.now(timezone.utc)
    t.reponse = reponse
    t.commentaire_reponse = commentaire
    t.statut = "refusee" if reponse == "refusee" else "terminee"
    t.terminee_at = maintenant
    t.updated_at = maintenant
    t.vue_at = t.vue_at or maintenant
    session.add(t)
    nom = user.nom_affichage or user.username
    notifier(
        session, t.emetteur, f"{nom} {VERBES.get(reponse, 'a traité')} : {t.titre}",
        commentaire or f"{TYPES.get(t.type_tache, 'Tâche')} clôturée le {maintenant.strftime('%d/%m/%Y à %H:%M')} UTC.",
        type_notif="validation" if reponse != "refusee" else "deadline",
        url=f"/taches?id={t.id}", emise_par=user.username, target_type="tache", target_id=t.id,
    )
    session.add(AuditLog(action=f"tache_{reponse}", target_type="tache", target_id=t.id, user=user.username,
                         payload={"titre": t.titre, "emetteur": t.emetteur}))
    session.commit()
    session.refresh(t)
    return t


# ─────────────────────────────────────────────── lecture
@router.get("")
def lister(
    boite: str = "recues",  # recues | envoyees | toutes
    statut: str | None = None,  # a_faire | cloturees
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> list[dict]:
    user = _auth(user)
    stmt = select(Tache)
    if boite == "recues":
        stmt = stmt.where(Tache.destinataire == user.username)
    elif boite == "envoyees":
        stmt = stmt.where(Tache.emetteur == user.username)
    else:
        stmt = stmt.where((Tache.destinataire == user.username) | (Tache.emetteur == user.username))
    if statut == "a_faire":
        stmt = stmt.where(Tache.statut == "a_faire")
    elif statut == "cloturees":
        stmt = stmt.where(Tache.statut != "a_faire")
    noms = _noms(session)
    rows = [_vue(t, noms, session) for t in session.exec(stmt.order_by(desc(Tache.created_at))).all()]
    # À faire d'abord, par échéance la plus proche
    rows.sort(key=lambda r: (r["statut"] != "a_faire", r["echeance"] is None, str(r["echeance"] or ""),))
    return rows


@router.get("/compteurs")
def compteurs(session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    """Badges du menu + rappel automatique (une fois) des tâches reçues en retard."""
    user = _auth(user)
    maintenant = datetime.now(timezone.utc)
    recues = list(session.exec(select(Tache).where(Tache.destinataire == user.username).where(Tache.statut == "a_faire")).all())
    envoyees = list(session.exec(select(Tache).where(Tache.emetteur == user.username).where(Tache.statut == "a_faire")).all())
    en_retard = [t for t in recues if _utc(t.echeance) and _utc(t.echeance) < maintenant]
    for t in en_retard:
        if not t.rappel_retard_envoye:
            notifier(session, t.destinataire, f"Tâche en retard : {t.titre}",
                     f"Échéance dépassée ({_utc(t.echeance).strftime('%d/%m/%Y')}) — demandée par {t.emetteur}.",
                     type_notif="deadline", url=f"/taches?id={t.id}", emise_par="system", target_type="tache", target_id=t.id)
            notifier(session, t.emetteur, f"Tâche non traitée à l'échéance : {t.titre}",
                     f"Toujours en attente chez {t.destinataire}.", type_notif="deadline",
                     url=f"/taches?id={t.id}", emise_par="system", target_type="tache", target_id=t.id)
            t.rappel_retard_envoye = True
            session.add(t)
    session.commit()
    return {
        "a_faire": len(recues),
        "en_retard": len(en_retard),
        "a_signer": sum(1 for t in recues if t.type_tache == "signature"),
        "envoyees_en_attente": len(envoyees),
    }


@router.get("/{tache_id}")
def detail(tache_id: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    t = session.get(Tache, tache_id)
    if not t or (user.username not in (t.destinataire, t.emetteur) and user.role != "admin"):
        raise HTTPException(404, "Tâche introuvable")
    if user.username == t.destinataire and not t.vue_at:
        t.vue_at = datetime.now(timezone.utc)
        session.add(t)
        session.commit()
        session.refresh(t)
    noms = _noms(session)
    groupe = []
    if t.groupe and user.username == t.emetteur:
        groupe = [_vue(x, noms, session) for x in session.exec(select(Tache).where(Tache.groupe == t.groupe)).all()]
    return {**_vue(t, noms, session), "groupe_taches": groupe}


# ─────────────────────────────────────────────── création et réponses
class TacheCreate(BaseModel):
    type_tache: str = "validation"
    titre: str
    description: str = ""
    destinataires: list[str]
    echeance: datetime | None = None
    priorite: str = "normale"
    operation_id: int | None = None
    document_id: int | None = None


@router.post("")
def creer(body: TacheCreate, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> list[dict]:
    user = _auth(user)
    if body.type_tache not in TYPES:
        raise HTTPException(422, f"Type de tâche inconnu : {body.type_tache}")
    if body.priorite not in PRIORITES:
        raise HTTPException(422, "Priorité inconnue")
    if not body.titre.strip():
        raise HTTPException(422, "Le titre est obligatoire")
    actifs = {u.username for u in session.exec(select(User).where(User.actif == True)).all()}  # noqa: E712
    dest = [d for d in dict.fromkeys(body.destinataires) if d]
    inconnus = [d for d in dest if d not in actifs]
    if not dest:
        raise HTTPException(422, "Choisissez au moins un destinataire")
    if inconnus:
        raise HTTPException(422, f"Utilisateur(s) inconnu(s) : {', '.join(inconnus)}")
    doc = None
    if body.document_id:
        from .documents import peut_lire
        doc = session.get(Document, body.document_id)
        if not doc or not peut_lire(session, doc, user):
            raise HTTPException(404, "Document introuvable")
    if body.type_tache == "signature" and (not doc or doc.mimetype != "application/pdf"):
        raise HTTPException(422, "Une demande de signature nécessite un document PDF")

    groupe = uuid4().hex[:12]
    creees = []
    for d in dest:
        t = Tache(type_tache=body.type_tache, titre=body.titre.strip()[:200], description=body.description,
                  emetteur=user.username, destinataire=d, groupe=groupe, priorite=body.priorite,
                  echeance=body.echeance, operation_id=body.operation_id, document_id=body.document_id)
        session.add(t)
        creees.append(t)
    if doc:  # le destinataire doit pouvoir ouvrir le document
        doc.partage_avec = list(dict.fromkeys([*(doc.partage_avec or []), *[d for d in dest if d != doc.proprietaire]]))
        session.add(doc)
    session.commit()
    nom = user.nom_affichage or user.username
    for t in creees:
        session.refresh(t)
        ech = f" — échéance le {_utc(t.echeance).strftime('%d/%m/%Y')}" if t.echeance else ""
        urg = " (urgent)" if t.priorite == "urgente" else ""
        notifier(session, t.destinataire, f"Nouvelle tâche{urg} — {_libelle(t)}", f"Demandée par {nom}{ech}.",
                 type_notif=t.type_tache if t.type_tache in ("validation", "consultation") else "mention",
                 url=f"/taches?id={t.id}", emise_par=user.username, target_type="tache", target_id=t.id)
    session.add(AuditLog(action="tache_creation", target_type="tache", target_id=creees[0].id, user=user.username,
                         payload={"type": body.type_tache, "titre": body.titre, "destinataires": dest}))
    session.commit()
    noms = _noms(session)
    return [_vue(t, noms, session) for t in creees]


class ReponseBody(BaseModel):
    reponse: str
    commentaire: str = ""


@router.post("/{tache_id}/repondre")
def repondre(tache_id: int, body: ReponseBody, session: Session = Depends(get_session),
             user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    t = session.get(Tache, tache_id)
    if not t or t.destinataire != user.username:
        raise HTTPException(404, "Tâche introuvable")
    if t.statut != "a_faire":
        raise HTTPException(409, "Cette tâche est déjà clôturée")
    if body.reponse not in REPONSES.get(t.type_tache, set()):
        raise HTTPException(422, f"Réponse « {body.reponse} » impossible pour une tâche de type {t.type_tache}")
    if body.reponse == "refusee" and not body.commentaire.strip():
        raise HTTPException(422, "Indiquez le motif du refus")
    if body.reponse == "signee":
        sig = session.exec(select(SignatureDocument).where(SignatureDocument.document_id == t.document_id)
                           .where(SignatureDocument.signataire == user.username)
                           .where(SignatureDocument.signed_at >= t.created_at)).first()
        if not sig:
            raise HTTPException(422, "Signez d'abord le document (bouton « Signer le document »)")
    cloturer(session, t, user, body.reponse, body.commentaire.strip())
    return _vue(t, _noms(session), session)


@router.post("/{tache_id}/relancer")
def relancer(tache_id: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    t = session.get(Tache, tache_id)
    if not t or t.emetteur != user.username:
        raise HTTPException(404, "Tâche introuvable")
    if t.statut != "a_faire":
        raise HTTPException(409, "Cette tâche est déjà clôturée")
    notifier(session, t.destinataire, f"Relance — {_libelle(t)}", f"{user.nom_affichage or user.username} vous relance.",
             type_notif="deadline", url=f"/taches?id={t.id}", emise_par=user.username, target_type="tache", target_id=t.id)
    session.add(AuditLog(action="tache_relance", target_type="tache", target_id=t.id, user=user.username, payload={}))
    session.commit()
    return {"ok": True}


@router.post("/{tache_id}/annuler")
def annuler(tache_id: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    t = session.get(Tache, tache_id)
    if not t or (t.emetteur != user.username and user.role != "admin"):
        raise HTTPException(404, "Tâche introuvable")
    if t.statut != "a_faire":
        raise HTTPException(409, "Cette tâche est déjà clôturée")
    t.statut = "annulee"
    t.updated_at = datetime.now(timezone.utc)
    session.add(t)
    notifier(session, t.destinataire, f"Tâche annulée — {t.titre}", f"Annulée par {user.nom_affichage or user.username}.",
             url=f"/taches?id={t.id}", emise_par=user.username, target_type="tache", target_id=t.id)
    session.add(AuditLog(action="tache_annulation", target_type="tache", target_id=t.id, user=user.username, payload={}))
    session.commit()
    return {"ok": True}
