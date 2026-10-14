"""Porte-documents personnel : import, versions, partage, annotation, signature électronique."""
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlmodel import Session, desc, select

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..models import AuditLog, Document, DocumentVersion, SignatureDocument, SignatureUtilisateur, Tache, User
from ..notifier import notifier
from .. import pdf_outils

router = APIRouter()

DOCS_DIR = settings.data_dir / "documents"
CACHE_DIR = DOCS_DIR / "_cache"
DOCS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
MAX_MO = 25


# ─────────────────────────────────────────────── utilitaires
def _auth(user: User | None) -> User:
    if not user or not user.actif:
        raise HTTPException(401, "Authentification requise")
    return user


def _nom(session: Session, username: str) -> str:
    u = session.exec(select(User).where(User.username == username)).first()
    return (u.nom_affichage or u.username) if u else username


def peut_lire(session: Session, doc: Document, user: User) -> bool:
    if user.role == "admin" or doc.proprietaire == user.username or user.username in (doc.partage_avec or []):
        return True
    t = session.exec(
        select(Tache).where(Tache.document_id == doc.id)
        .where((Tache.destinataire == user.username) | (Tache.emetteur == user.username))
    ).first()
    return t is not None


def _doc(session: Session, doc_id: int, user: User) -> Document:
    doc = session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document introuvable")
    if not peut_lire(session, doc, user):
        raise HTTPException(403, "Vous n'avez pas accès à ce document")
    return doc


def _version(session: Session, doc: Document, numero: int | None = None) -> DocumentVersion:
    n = numero or doc.version_courante
    v = session.exec(
        select(DocumentVersion).where(DocumentVersion.document_id == doc.id).where(DocumentVersion.numero == n)
    ).first()
    if not v:
        raise HTTPException(404, f"Version {n} introuvable")
    return v


def _lire_fichier(v: DocumentVersion) -> bytes:
    p = DOCS_DIR / v.chemin
    if not p.exists():
        raise HTTPException(404, "Fichier manquant sur le disque")
    return p.read_bytes()


def _enregistrer_version(session: Session, doc: Document, data: bytes, auteur: str, commentaire: str) -> DocumentVersion:
    numero = (session.exec(
        select(DocumentVersion.numero).where(DocumentVersion.document_id == doc.id).order_by(desc(DocumentVersion.numero))
    ).first() or 0) + 1
    sous = DOCS_DIR / str(doc.id)
    sous.mkdir(parents=True, exist_ok=True)
    ext = Path(doc.nom_fichier).suffix or (".pdf" if doc.mimetype == "application/pdf" else "")
    chemin = sous / f"v{numero}_{uuid4().hex[:10]}{ext}"
    chemin.write_bytes(data)
    v = DocumentVersion(
        document_id=doc.id, numero=numero, chemin=str(chemin.relative_to(DOCS_DIR)).replace("\\", "/"),
        taille=len(data), sha256=pdf_outils.sha256(data),
        nb_pages=pdf_outils.nb_pages(data) if doc.mimetype == "application/pdf" else 0,
        auteur=auteur, commentaire=commentaire,
    )
    session.add(v)
    doc.version_courante = numero
    doc.updated_at = datetime.now(timezone.utc)
    session.add(doc)
    return v


def resume(session: Session, doc: Document, user: User) -> dict:
    v = session.exec(
        select(DocumentVersion).where(DocumentVersion.document_id == doc.id).where(DocumentVersion.numero == doc.version_courante)
    ).first()
    a_signer = session.exec(
        select(Tache).where(Tache.document_id == doc.id).where(Tache.destinataire == user.username)
        .where(Tache.type_tache == "signature").where(Tache.statut == "a_faire")
    ).first()
    return {
        **doc.model_dump(),
        "proprietaire_nom": _nom(session, doc.proprietaire),
        "acces": "proprietaire" if doc.proprietaire == user.username else "partage",
        "taille": v.taille if v else 0,
        "nb_pages": v.nb_pages if v else 0,
        "est_pdf": doc.mimetype == "application/pdf",
        "tache_signature_id": a_signer.id if a_signer else None,
    }


# ─────────────────────────────────────────────── signature de l'utilisateur
class SignatureBody(BaseModel):
    image: str
    paraphe: str = ""


@router.get("/ma-signature")
def lire_ma_signature(session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    s = session.exec(select(SignatureUtilisateur).where(SignatureUtilisateur.username == user.username)).first()
    return {"image": s.image if s else "", "paraphe": s.paraphe if s else "", "updated_at": s.updated_at if s else None}


@router.put("/ma-signature")
def enregistrer_ma_signature(body: SignatureBody, session: Session = Depends(get_session),
                             user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    if not body.image.startswith("data:image/png;base64,") or len(body.image) > 600_000:
        raise HTTPException(400, "Signature invalide (image PNG attendue, 450 Ko max)")
    s = session.exec(select(SignatureUtilisateur).where(SignatureUtilisateur.username == user.username)).first()
    if not s:
        s = SignatureUtilisateur(username=user.username, image=body.image)
    s.image = body.image
    s.paraphe = body.paraphe if body.paraphe.startswith("data:image/png;base64,") else ""
    s.updated_at = datetime.now(timezone.utc)
    session.add(s)
    session.add(AuditLog(action="signature_enregistree", target_type="user", user=user.username, payload={}))
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────── liste / import
@router.get("")
def lister(
    vue: str = "tous",  # tous | mes | partages | a_signer | signes
    dossier: str | None = None,
    operation_id: int | None = None,
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> dict:
    user = _auth(user)
    docs = list(session.exec(select(Document).order_by(desc(Document.updated_at))).all())
    ids_taches = {t.document_id for t in session.exec(
        select(Tache).where((Tache.destinataire == user.username) | (Tache.emetteur == user.username))
    ).all() if t.document_id}
    visibles = [d for d in docs if d.proprietaire == user.username or user.username in (d.partage_avec or [])
                or d.id in ids_taches]
    rows = [resume(session, d, user) for d in visibles]
    if vue == "mes":
        rows = [r for r in rows if r["acces"] == "proprietaire"]
    elif vue == "partages":
        rows = [r for r in rows if r["acces"] == "partage"]
    elif vue == "a_signer":
        rows = [r for r in rows if r["tache_signature_id"]]
    elif vue == "signes":
        rows = [r for r in rows if r["statut"] == "signe"]
    if dossier:
        rows = [r for r in rows if r["dossier"] == dossier]
    if operation_id is not None:
        rows = [r for r in rows if r["operation_id"] == operation_id]
    dossiers = sorted({d.dossier for d in visibles if d.proprietaire == user.username} | {"Général"})
    return {"rows": rows, "dossiers": dossiers}


@router.post("")
async def importer(
    file: UploadFile = File(...),
    titre: str = Form(""),
    dossier: str = Form("Général"),
    description: str = Form(""),
    operation_id: int | None = Form(None),
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
) -> dict:
    user = _auth(user)
    data = await file.read()
    if not data:
        raise HTTPException(400, "Fichier vide")
    if len(data) > MAX_MO * 1024 * 1024:
        raise HTTPException(413, f"Fichier trop volumineux ({MAX_MO} Mo max)")
    nom = (file.filename or "document").replace("\\", "_").replace("/", "_")
    pdf = pdf_outils.est_pdf(data)
    if nom.lower().endswith(".pdf") and not pdf:
        raise HTTPException(400, "Le fichier porte l'extension .pdf mais n'est pas un PDF valide")
    if pdf:
        try:
            pdf_outils.infos_pages(data)
        except pdf_outils.ErreurPdf as e:
            raise HTTPException(400, str(e))
    doc = Document(
        titre=(titre or Path(nom).stem)[:200], nom_fichier=nom,
        mimetype="application/pdf" if pdf else (file.content_type or "application/octet-stream"),
        proprietaire=user.username, dossier=(dossier or "Général")[:80], description=description,
        operation_id=operation_id, version_courante=0,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    _enregistrer_version(session, doc, data, user.username, "Import")
    session.add(AuditLog(action="document_import", target_type="document", target_id=doc.id, user=user.username,
                         payload={"titre": doc.titre, "taille": len(data)}))
    session.commit()
    session.refresh(doc)
    return resume(session, doc, user)


@router.get("/{doc_id}")
def detail(doc_id: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    versions = list(session.exec(
        select(DocumentVersion).where(DocumentVersion.document_id == doc.id).order_by(desc(DocumentVersion.numero))
    ).all())
    signatures = list(session.exec(
        select(SignatureDocument).where(SignatureDocument.document_id == doc.id).order_by(SignatureDocument.signed_at)
    ).all())
    taches = list(session.exec(select(Tache).where(Tache.document_id == doc.id).order_by(desc(Tache.created_at))).all())
    return {
        **resume(session, doc, user),
        "versions": versions,
        "signatures": signatures,
        "taches": [{**t.model_dump(), "destinataire_nom": _nom(session, t.destinataire),
                    "emetteur_nom": _nom(session, t.emetteur)} for t in taches],
        "peut_gerer": user.role == "admin" or doc.proprietaire == user.username,
    }


class DocumentUpdate(BaseModel):
    titre: str | None = None
    dossier: str | None = None
    description: str | None = None
    partage_avec: list[str] | None = None
    operation_id: int | None = None


@router.put("/{doc_id}")
def modifier(doc_id: int, body: DocumentUpdate, session: Session = Depends(get_session),
             user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    if not (user.role == "admin" or doc.proprietaire == user.username):
        raise HTTPException(403, "Seul le propriétaire peut modifier ce document")
    nouveaux = []
    if body.partage_avec is not None:
        connus = {u.username for u in session.exec(select(User)).all()}
        cible = [u for u in dict.fromkeys(body.partage_avec) if u in connus and u != doc.proprietaire]
        nouveaux = [u for u in cible if u not in (doc.partage_avec or [])]
        doc.partage_avec = cible
    for k in ("titre", "dossier", "description", "operation_id"):
        v = getattr(body, k)
        if v is not None:
            setattr(doc, k, v)
    doc.updated_at = datetime.now(timezone.utc)
    session.add(doc)
    for u in nouveaux:
        notifier(session, u, f"Document partagé : {doc.titre}", f"{_nom(session, user.username)} a partagé un document avec vous.",
                 type_notif="consultation", url=f"/documents/{doc.id}", emise_par=user.username,
                 target_type="document", target_id=doc.id)
    session.commit()
    session.refresh(doc)
    return resume(session, doc, user)


@router.delete("/{doc_id}")
def supprimer(doc_id: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    if not (user.role == "admin" or doc.proprietaire == user.username):
        raise HTTPException(403, "Seul le propriétaire peut supprimer ce document")
    en_cours = session.exec(select(Tache).where(Tache.document_id == doc.id).where(Tache.statut == "a_faire")).first()
    if en_cours:
        raise HTTPException(409, "Des tâches sont en cours sur ce document : annulez-les avant de le supprimer.")
    for v in session.exec(select(DocumentVersion).where(DocumentVersion.document_id == doc.id)).all():
        (DOCS_DIR / v.chemin).unlink(missing_ok=True)
        session.delete(v)
    for s in session.exec(select(SignatureDocument).where(SignatureDocument.document_id == doc.id)).all():
        session.delete(s)
    for t in session.exec(select(Tache).where(Tache.document_id == doc.id)).all():
        t.document_id = None
        session.add(t)
    session.delete(doc)
    session.add(AuditLog(action="document_suppression", target_type="document", target_id=doc_id, user=user.username,
                         payload={"titre": doc.titre}))
    session.commit()
    return {"ok": True}


@router.post("/{doc_id}/versions")
async def nouvelle_version(doc_id: int, file: UploadFile = File(...), commentaire: str = Form("Nouvelle version"),
                           session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    data = await file.read()
    if not data or len(data) > MAX_MO * 1024 * 1024:
        raise HTTPException(400, f"Fichier vide ou trop volumineux ({MAX_MO} Mo max)")
    if doc.mimetype == "application/pdf" and not pdf_outils.est_pdf(data):
        raise HTTPException(400, "La nouvelle version doit être un PDF")
    _enregistrer_version(session, doc, data, user.username, commentaire or "Nouvelle version")
    doc.statut = "brouillon"
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return resume(session, doc, user)


# ─────────────────────────────────────────────── fichiers et pages
@router.get("/{doc_id}/versions/{numero}/fichier")
def telecharger(doc_id: int, numero: int, session: Session = Depends(get_session),
                user: User | None = Depends(get_current_user)):
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    v = _version(session, doc, numero)
    p = DOCS_DIR / v.chemin
    if not p.exists():
        raise HTTPException(404, "Fichier manquant sur le disque")
    stem, ext = Path(doc.nom_fichier).stem, Path(doc.nom_fichier).suffix
    nom = f"{stem}_v{v.numero}{ext}" if v.numero > 1 else doc.nom_fichier
    return FileResponse(str(p), media_type=doc.mimetype, filename=nom)


@router.get("/{doc_id}/versions/{numero}/pages")
def pages(doc_id: int, numero: int, session: Session = Depends(get_session),
          user: User | None = Depends(get_current_user)) -> list[dict]:
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    if doc.mimetype != "application/pdf":
        raise HTTPException(400, "Aperçu disponible uniquement pour les PDF")
    try:
        return pdf_outils.infos_pages(_lire_fichier(_version(session, doc, numero)))
    except pdf_outils.ErreurPdf as e:
        raise HTTPException(400, str(e))


@router.get("/{doc_id}/versions/{numero}/pages/{page}.png")
def page_png(doc_id: int, numero: int, page: int, largeur: int = 1000, session: Session = Depends(get_session),
             user: User | None = Depends(get_current_user)):
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    v = _version(session, doc, numero)
    largeur = max(200, min(2000, largeur))
    cache = CACHE_DIR / f"{doc.id}_v{v.numero}_{v.sha256[:12]}_p{page}_{largeur}.png"
    if not cache.exists():
        try:
            cache.write_bytes(pdf_outils.rendre_page_png(_lire_fichier(v), page, largeur))
        except pdf_outils.ErreurPdf as e:
            raise HTTPException(400, str(e))
    return Response(cache.read_bytes(), media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})


# ─────────────────────────────────────────────── annotation / signature
class Annotation(BaseModel):
    page: int
    type: str
    x: float
    y: float
    w: float
    h: float
    texte: str = ""
    taille: float | None = None
    couleur: str | None = None


class AnnoterBody(BaseModel):
    annotations: list[Annotation] = []
    pages_supprimees: list[int] = []
    rotations: dict[int, int] = {}
    commentaire: str = ""
    tache_id: int | None = None
    version_base: int | None = None


@router.post("/{doc_id}/annoter")
def annoter(doc_id: int, body: AnnoterBody, request: Request, session: Session = Depends(get_session),
            user: User | None = Depends(get_current_user)) -> dict:
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    if doc.mimetype != "application/pdf":
        raise HTTPException(400, "Seuls les PDF peuvent être modifiés ou signés")
    if body.version_base and body.version_base != doc.version_courante:
        raise HTTPException(409, f"Le document a été modifié entre-temps (version v{doc.version_courante}). Rechargez-le.")
    if not body.annotations and not body.pages_supprimees and not any(a % 360 for a in body.rotations.values()):
        raise HTTPException(400, "Aucune modification à enregistrer")

    signe = any(a.type in ("signature", "paraphe") for a in body.annotations)
    sig = session.exec(select(SignatureUtilisateur).where(SignatureUtilisateur.username == user.username)).first()
    if signe and not sig:
        raise HTTPException(400, "Enregistrez d'abord votre signature (porte-documents → Ma signature).")

    tache = None
    if body.tache_id:
        tache = session.get(Tache, body.tache_id)
        if not tache or tache.destinataire != user.username or tache.document_id != doc.id:
            raise HTTPException(403, "Cette tâche ne vous est pas adressée pour ce document")
        if tache.statut != "a_faire":
            raise HTTPException(409, "Cette tâche est déjà clôturée")

    base = _version(session, doc)
    nom = _nom(session, user.username)
    maintenant = datetime.now(timezone.utc)
    try:
        data, pages_signees = pdf_outils.appliquer(
            _lire_fichier(base), [a.model_dump() for a in body.annotations],
            signature_png=sig.image if sig else None, paraphe_png=(sig.paraphe or sig.image) if sig else None,
            signataire=nom, reference=f"document n° {doc.id}",
            pages_supprimees=body.pages_supprimees, rotations=body.rotations, maintenant=maintenant,
        )
    except pdf_outils.ErreurPdf as e:
        raise HTTPException(400, str(e))

    commentaire = body.commentaire or (f"Signature de {nom}" if signe else "Modifications (annotations)")
    v = _enregistrer_version(session, doc, data, user.username, commentaire)
    if signe:
        doc.statut = "signe"
        session.add(SignatureDocument(
            document_id=doc.id, version_numero=v.numero, signataire=user.username, nom_affichage=nom,
            signed_at=maintenant, sha256=v.sha256, ip=(request.client.host if request.client else ""),
            pages=pages_signees, tache_id=tache.id if tache else None,
        ))
        if doc.proprietaire != user.username and not tache:
            notifier(session, doc.proprietaire, f"Document signé : {doc.titre}", f"{nom} a signé le document (v{v.numero}).",
                     type_notif="validation", url=f"/documents/{doc.id}", emise_par=user.username,
                     target_type="document", target_id=doc.id)
    session.add(doc)
    session.add(AuditLog(action="document_signature" if signe else "document_annotation", target_type="document",
                         target_id=doc.id, user=user.username,
                         payload={"version": v.numero, "sha256": v.sha256, "nb_annotations": len(body.annotations)}))
    session.commit()

    if tache and signe and tache.type_tache == "signature":
        from .taches import cloturer  # import local : évite la dépendance circulaire
        cloturer(session, tache, user, "signee", body.commentaire or f"Signé (version v{v.numero})")
    session.refresh(doc)
    return {**resume(session, doc, user), "version": v.numero}


@router.get("/{doc_id}/certificat.pdf")
def certificat(doc_id: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)):
    user = _auth(user)
    doc = _doc(session, doc_id, user)
    versions = session.exec(select(DocumentVersion).where(DocumentVersion.document_id == doc.id).order_by(DocumentVersion.numero)).all()
    signatures = session.exec(select(SignatureDocument).where(SignatureDocument.document_id == doc.id).order_by(SignatureDocument.signed_at)).all()
    fmt = lambda d: d.strftime("%d/%m/%Y %H:%M") if d else ""  # noqa: E731
    pdf = pdf_outils.certificat(
        doc.model_dump(),
        [{**v.model_dump(), "created_at": fmt(v.created_at)} for v in versions],
        [{**s.model_dump(), "signed_at": fmt(s.signed_at)} for s in signatures],
    )
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="certificat_document_{doc.id}.pdf"'})
