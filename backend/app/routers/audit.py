"""M7 — Journal d'audit : liste avec filtres + export CSV."""
from io import StringIO
import csv
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, desc
from datetime import datetime, timezone, timedelta

from ..db import get_session
from ..models import AuditLog

router = APIRouter()


@router.get("")
def list_audit(
    limit: int = 200,
    offset: int = 0,
    action: str | None = Query(default=None, description="Filtre action (ex: calcul_bilan)"),
    target_type: str | None = None,
    target_id: int | None = None,
    since_days: int | None = Query(default=None, description="Dernier N jours"),
    session: Session = Depends(get_session),
) -> dict:
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)
    if target_id is not None:
        stmt = stmt.where(AuditLog.target_id == target_id)
    if since_days:
        since = datetime.now(timezone.utc) - timedelta(days=since_days)
        stmt = stmt.where(AuditLog.at >= since)
    stmt = stmt.order_by(desc(AuditLog.at)).offset(offset).limit(limit)
    rows = list(session.exec(stmt).all())
    # Compter total (sans limit)
    cnt_stmt = select(AuditLog)
    if action:
        cnt_stmt = cnt_stmt.where(AuditLog.action == action)
    if target_type:
        cnt_stmt = cnt_stmt.where(AuditLog.target_type == target_type)
    if target_id is not None:
        cnt_stmt = cnt_stmt.where(AuditLog.target_id == target_id)
    if since_days:
        since = datetime.now(timezone.utc) - timedelta(days=since_days)
        cnt_stmt = cnt_stmt.where(AuditLog.at >= since)
    total = len(list(session.exec(cnt_stmt).all()))
    return {"rows": rows, "total": total, "offset": offset, "limit": limit}


@router.get("/actions")
def list_actions(session: Session = Depends(get_session)) -> dict:
    """Liste des types d'action présents dans le journal (pour filtre UI)."""
    rows = session.exec(select(AuditLog.action).distinct()).all()
    return {"actions": sorted(set(rows))}


@router.get("/export.csv")
def export_csv(session: Session = Depends(get_session)):
    rows = list(session.exec(select(AuditLog).order_by(desc(AuditLog.at))).all())
    buf = StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["id", "at_utc", "user", "action", "target_type", "target_id", "payload"])
    for r in rows:
        writer.writerow([
            r.id,
            r.at.isoformat() if r.at else "",
            r.user or "",
            r.action or "",
            r.target_type or "",
            r.target_id if r.target_id is not None else "",
            str(r.payload) if r.payload else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit.csv"'},
    )
