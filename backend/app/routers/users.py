"""CRUD utilisateurs — réservé admin."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel

from ..db import get_session
from ..models import User, AuditLog
from ..auth import hash_password, require_admin

router = APIRouter()


class UserPublic(BaseModel):
    id: int
    username: str
    email: str
    role: str
    nom_affichage: str
    actif: bool


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "lecture"
    email: str = ""
    nom_affichage: str = ""


class UserUpdate(BaseModel):
    email: str | None = None
    role: str | None = None
    nom_affichage: str | None = None
    actif: bool | None = None
    password: str | None = None


@router.get("")
def list_users(
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> list[UserPublic]:
    rows = session.exec(select(User)).all()
    return [UserPublic(**u.model_dump()) for u in rows]


@router.post("")
def create_user(
    body: UserCreate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> UserPublic:
    if body.role not in ("admin", "saisie", "lecture"):
        raise HTTPException(400, "Rôle invalide")
    exists = session.exec(select(User).where(User.username == body.username)).first()
    if exists:
        raise HTTPException(409, f"Utilisateur {body.username} existe déjà")
    u = User(
        username=body.username,
        email=body.email,
        role=body.role,
        nom_affichage=body.nom_affichage or body.username,
        password_hash=hash_password(body.password),
        actif=True,
    )
    session.add(u)
    session.add(AuditLog(
        action="user_create",
        target_type="user",
        user=admin.username,
        payload={"username": u.username, "role": u.role},
    ))
    session.commit()
    session.refresh(u)
    return UserPublic(**u.model_dump())


@router.put("/{user_id}")
def update_user(
    user_id: int,
    body: UserUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> UserPublic:
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    if body.email is not None:
        u.email = body.email
    if body.role is not None:
        if body.role not in ("admin", "saisie", "lecture"):
            raise HTTPException(400, "Rôle invalide")
        u.role = body.role
    if body.nom_affichage is not None:
        u.nom_affichage = body.nom_affichage
    if body.actif is not None:
        u.actif = body.actif
    if body.password:
        u.password_hash = hash_password(body.password)
    session.add(u)
    session.add(AuditLog(
        action="user_update",
        target_type="user",
        target_id=user_id,
        user=admin.username,
        payload=body.model_dump(exclude_none=True, exclude={"password"}),
    ))
    session.commit()
    session.refresh(u)
    return UserPublic(**u.model_dump())


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> dict:
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    if u.username == admin.username:
        raise HTTPException(400, "Impossible de se supprimer soi-même")
    session.delete(u)
    session.add(AuditLog(
        action="user_delete",
        target_type="user",
        target_id=user_id,
        user=admin.username,
        payload={"username": u.username},
    ))
    session.commit()
    return {"ok": True}
