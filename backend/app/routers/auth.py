"""Endpoints auth : /login, /me."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from ..db import get_session
from ..models import User, AuditLog
from ..auth import verify_password, create_access_token, get_current_user

router = APIRouter()


@router.post("/login")
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> dict:
    stmt = select(User).where(User.username == form.username)
    user = session.exec(stmt).first()
    if not user or not verify_password(form.password, user.password_hash):
        session.add(AuditLog(
            action="login_failed",
            target_type="user",
            user=form.username,
            payload={"reason": "credentials"},
        ))
        session.commit()
        raise HTTPException(401, "Identifiants invalides")
    if not user.actif:
        raise HTTPException(403, "Compte désactivé")
    token = create_access_token(user.username, user.role)
    session.add(AuditLog(
        action="login_success",
        target_type="user",
        target_id=user.id,
        user=user.username,
    ))
    session.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "role": user.role,
            "nom_affichage": user.nom_affichage,
        },
    }


@router.get("/me")
def me(user: User | None = Depends(get_current_user)) -> dict:
    if not user:
        raise HTTPException(401, "Non authentifié")
    return {
        "username": user.username,
        "role": user.role,
        "nom_affichage": user.nom_affichage,
    }
