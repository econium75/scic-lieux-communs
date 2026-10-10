from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Menage

router = APIRouter()


@router.get("/scenario/{scenario_id}")
def list_menages(scenario_id: int, session: Session = Depends(get_session)) -> list[Menage]:
    stmt = select(Menage).where(Menage.scenario_id == scenario_id)
    return list(session.exec(stmt).all())


@router.get("/{menage_id}")
def get_menage(menage_id: int, session: Session = Depends(get_session)) -> Menage:
    m = session.get(Menage, menage_id)
    if not m:
        raise HTTPException(404, "Ménage introuvable")
    return m


@router.post("")
def create_menage(menage: Menage, session: Session = Depends(get_session)) -> Menage:
    session.add(menage)
    session.commit()
    session.refresh(menage)
    return menage


@router.put("/{menage_id}")
def update_menage(menage_id: int, data: dict, session: Session = Depends(get_session)) -> Menage:
    m = session.get(Menage, menage_id)
    if not m:
        raise HTTPException(404, "Ménage introuvable")
    for k, v in data.items():
        if hasattr(m, k):
            setattr(m, k, v)
    session.add(m)
    session.commit()
    session.refresh(m)
    return m
