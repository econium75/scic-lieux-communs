from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Operation, Scenario

router = APIRouter()


@router.get("")
def list_operations(session: Session = Depends(get_session)) -> list[Operation]:
    return list(session.exec(select(Operation)).all())


@router.get("/{operation_id}")
def get_operation(operation_id: int, session: Session = Depends(get_session)) -> Operation:
    op = session.get(Operation, operation_id)
    if not op:
        raise HTTPException(404, "Opération non trouvée")
    return op


@router.get("/{operation_id}/scenarios")
def list_scenarios(operation_id: int, session: Session = Depends(get_session)) -> list[Scenario]:
    stmt = select(Scenario).where(Scenario.operation_id == operation_id)
    return list(session.exec(stmt).all())


@router.post("")
def create_operation(op: Operation, session: Session = Depends(get_session)) -> Operation:
    session.add(op)
    session.commit()
    session.refresh(op)
    return op
