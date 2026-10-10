"""Pièces jointes attachables aux opérations, phases, événements, scénarios."""
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlmodel import Session, select, desc

from ..config import settings
from ..db import get_session
from ..models import Attachment, AuditLog, User
from ..auth import get_current_user, require_saisie

router = APIRouter()

ATTACHMENTS_DIR = settings.data_dir / "attachments"
ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

MAX_SIZE_MB = 50
ALLOWED_PARENT_TYPES = {"operation", "phase", "event", "scenario"}


@router.get("/{parent_type}/{parent_id}")
def list_attachments(
    parent_type: str,
    parent_id: int,
    session: Session = Depends(get_session),
) -> list[Attachment]:
    if parent_type not in ALLOWED_PARENT_TYPES:
        raise HTTPException(400, f"Type parent invalide : {parent_type}")
    stmt = (
        select(Attachment)
        .where(Attachment.parent_type == parent_type)
        .where(Attachment.parent_id == parent_id)
        .order_by(desc(Attachment.uploaded_at))
    )
    return list(session.exec(stmt).all())


@router.post("/{parent_type}/{parent_id}")
async def upload_attachment(
    parent_type: str,
    parent_id: int,
    file: UploadFile = File(...),
    description: str = Form(""),
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> Attachment:
    if parent_type not in ALLOWED_PARENT_TYPES:
        raise HTTPException(400, f"Type parent invalide : {parent_type}")

    content = await file.read()
    size = len(content)
    if size > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, f"Fichier trop volumineux (max {MAX_SIZE_MB} Mo)")
    if size == 0:
        raise HTTPException(400, "Fichier vide")

    # Dossier par type/id
    subdir = ATTACHMENTS_DIR / parent_type / str(parent_id)
    subdir.mkdir(parents=True, exist_ok=True)

    # Nom unique pour éviter collisions
    safe_name = (file.filename or "fichier").replace("\\", "_").replace("/", "_")
    stored_name = f"{uuid4().hex[:12]}_{safe_name}"
    stored_path = subdir / stored_name
    stored_path.write_bytes(content)

    att = Attachment(
        parent_type=parent_type,
        parent_id=parent_id,
        filename=safe_name,
        mimetype=file.content_type or "application/octet-stream",
        size=size,
        description=description,
        stored_path=str(stored_path.relative_to(ATTACHMENTS_DIR)).replace("\\", "/"),
        uploaded_by=user.username,
    )
    session.add(att)
    session.add(AuditLog(
        action="attachment_upload",
        target_type=parent_type,
        target_id=parent_id,
        user=user.username,
        payload={"filename": safe_name, "size": size},
    ))
    session.commit()
    session.refresh(att)
    return att


@router.get("/download/{attachment_id}")
def download_attachment(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user),
):
    if not user:
        raise HTTPException(401, "Authentification requise")
    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(404, "Pièce jointe introuvable")
    path = ATTACHMENTS_DIR / att.stored_path
    if not path.exists():
        raise HTTPException(404, "Fichier manquant sur disque")
    return FileResponse(str(path), media_type=att.mimetype, filename=att.filename)


@router.delete("/{attachment_id}")
def delete_attachment(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> dict:
    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(404, "Pièce jointe introuvable")
    path = ATTACHMENTS_DIR / att.stored_path
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass
    session.delete(att)
    session.add(AuditLog(
        action="attachment_delete",
        target_type=att.parent_type,
        target_id=att.parent_id,
        user=user.username,
        payload={"filename": att.filename},
    ))
    session.commit()
    return {"ok": True}
