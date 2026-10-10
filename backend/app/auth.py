"""Auth JWT + 3 profils (admin / saisie / lecture).

Hiérarchie des rôles :
  admin   : tout (CRUD référentiels, suppression scénarios, édition hypothèses, exports)
  saisie  : CRUD opérations/scénarios/ménages, exports, PAS d'édition des référentiels
  lecture : lecture seule + exports autorisés

Les routes GET restent ouvertes aux 3 rôles ; les routes de mutation nécessitent
"saisie" minimum ; les référentiels nécessitent "admin".
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
from sqlmodel import Session, select

from .config import settings
from .db import get_session
from .models import User

ALGO = "HS256"
TOKEN_EXPIRES_HOURS = 24

ROLE_HIERARCHY = ["lecture", "saisie", "admin"]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(plain: str) -> str:
    pwd_bytes = plain.encode("utf-8")[:72]  # bcrypt limite 72 bytes
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(sub: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRES_HOURS)
    payload = {"sub": sub, "role": role, "exp": exp}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGO)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGO])
    except JWTError:
        return None


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> Optional[User]:
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    stmt = select(User).where(User.username == sub)
    return session.exec(stmt).first()


def require_role(min_role: str):
    """Dependency qui exige au moins ce rôle."""
    def _dep(user: Optional[User] = Depends(get_current_user)) -> User:
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentification requise",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.actif:
            raise HTTPException(403, "Compte désactivé")
        try:
            idx_user = ROLE_HIERARCHY.index(user.role)
            idx_min = ROLE_HIERARCHY.index(min_role)
        except ValueError:
            raise HTTPException(403, f"Rôle inconnu : {user.role}")
        if idx_user < idx_min:
            raise HTTPException(
                403,
                f"Rôle insuffisant (requis : {min_role}, actuel : {user.role})",
            )
        return user
    return _dep


# Dependencies prêtes à utiliser
require_lecture = require_role("lecture")
require_saisie = require_role("saisie")
require_admin = require_role("admin")


def seed_default_users(session: Session) -> None:
    """Crée 3 utilisateurs par défaut si vide. À changer en production."""
    if session.exec(select(User)).first():
        return
    defaults = [
        ("admin", "admin123", "admin", "Administrateur SCIC"),
        ("saisie", "saisie123", "saisie", "Opérateur saisie"),
        ("lecture", "lecture123", "lecture", "Lecteur (COPIL)"),
    ]
    for username, pwd, role, nom in defaults:
        session.add(User(
            username=username,
            password_hash=hash_password(pwd),
            role=role,
            nom_affichage=nom,
            actif=True,
        ))
    session.commit()
