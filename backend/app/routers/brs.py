"""Commercialisation BRS : hypothèses du scénario, ménages candidats, simulation d'un ménage, programme et subventions."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import get_current_user, require_saisie
from ..db import get_session
from ..engines import commercialisation as brs
from ..excel.commercialisation import build_commercialisation
from ..models import AuditLog, HypothesesBRS, Menage, Operation, Scenario, User

router = APIRouter()


def _auth(user: User | None) -> User:
    if not user or not user.actif:
        raise HTTPException(401, "Authentification requise")
    return user


def _scenario(session: Session, sid: int) -> Scenario:
    sc = session.get(Scenario, sid)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")
    return sc


def _hypotheses(session: Session, sid: int) -> dict:
    row = session.exec(select(HypothesesBRS).where(HypothesesBRS.scenario_id == sid)).first()
    return brs.hypotheses(row.data if row else None)


def entree(m: Menage) -> dict:
    """Champs du ménage attendus par le moteur ; les ménages saisis avant la refonte n'ont que le nombre de personnes."""
    adultes = m.adultes or 1
    if adultes == 1 and m.nb_personnes > m.nb_enfants + 1:
        adultes = m.nb_personnes - m.nb_enfants
    return {"reference": m.reference, "typologie": m.typologie_logement, "adultes": adultes, "enfants": m.nb_enfants,
            "rfr_n2": m.revenu_fiscal_annuel, "revenu_disponible_annuel": m.revenu_disponible_annuel,
            "revenus_nets_mensuels": m.revenus_nets_mensuels, "credits_mensuels": m.credits_mensuels, "apport": m.apport}


def _vue_menage(m: Menage, h: dict) -> dict:
    e = entree(m)
    return {"id": m.id, **e, "notes": m.notes, "resultat": brs.simuler_menage(h, e)}


def etat(session: Session, sid: int) -> dict:
    sc = _scenario(session, sid)
    h = _hypotheses(session, sid)
    menages = [_vue_menage(m, h) for m in session.exec(select(Menage).where(Menage.scenario_id == sid).order_by(Menage.id)).all()]
    resultats = [x["resultat"] for x in menages]
    op = session.get(Operation, sc.operation_id)
    return {
        "scenario": {"id": sc.id, "nom": sc.nom, "operation_id": sc.operation_id, "operation_nom": op.nom if op else ""},
        "hypotheses": h,
        "menages": menages,
        "programme": brs.programme(h),
        "couverture": brs.couverture(h, resultats),
        "synthese": {v: sum(1 for r in resultats if r["verdict"] == v) for v in brs.VERDICTS},
    }


@router.get("/scenario/{sid}")
def lire(sid: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    _auth(user)
    return etat(session, sid)


@router.put("/scenario/{sid}/hypotheses")
def enregistrer_hypotheses(sid: int, body: dict, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    _scenario(session, sid)
    h = brs.hypotheses(body)
    codes = [str(t.get("code") or "").strip() for t in h["typologies"]]
    if not codes or any(not c for c in codes) or len(set(codes)) != len(codes):
        raise HTTPException(422, "Chaque typologie doit avoir un code unique (T2, T3…)")
    for t in h["typologies"]:
        for k in ("surface", "prix_ttc", "nb"):
            if brs._num(t.get(k), -1) < 0:
                raise HTTPException(422, f"Typologie {t['code']} : valeur invalide pour {k}")
    for k in ("taux_pret", "taux_assurance", "frais_acquisition", "taux_effort_max"):
        if not 0 <= brs._num(h.get(k), -1) <= 1:
            raise HTTPException(422, f"Taux invalide : {k} (attendu entre 0 et 100 %)")
    if brs._num(h.get("duree_ans")) <= 0:
        raise HTTPException(422, "La durée du prêt doit être positive")
    row = session.exec(select(HypothesesBRS).where(HypothesesBRS.scenario_id == sid)).first() or HypothesesBRS(scenario_id=sid)
    row.data, row.updated_by, row.updated_at = h, user.username, datetime.now(timezone.utc)
    session.add(row)
    session.add(AuditLog(action="brs_hypotheses", target_type="scenario", target_id=sid, user=user.username, payload={}))
    session.commit()
    return etat(session, sid)


class MenageBody(BaseModel):
    reference: str | None = None
    typologie: str | None = None
    adultes: int | None = None
    enfants: int | None = None
    rfr_n2: float | None = None
    revenu_disponible_annuel: float | None = None
    revenus_nets_mensuels: float | None = None
    credits_mensuels: float | None = None
    apport: float | None = None
    notes: str | None = None


def _appliquer(m: Menage, b: MenageBody) -> None:
    champs = {"reference": "reference", "typologie": "typologie_logement", "adultes": "adultes", "enfants": "nb_enfants",
              "rfr_n2": "revenu_fiscal_annuel", "revenu_disponible_annuel": "revenu_disponible_annuel",
              "revenus_nets_mensuels": "revenus_nets_mensuels", "credits_mensuels": "credits_mensuels", "apport": "apport", "notes": "notes"}
    for k, v in b.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(m, champs[k], v.strip() if isinstance(v, str) else v)
    if not (m.reference or "").strip():
        raise HTTPException(422, "La référence du ménage est obligatoire")
    if (m.adultes or 0) < 1 or (m.nb_enfants or 0) < 0:
        raise HTTPException(422, "Il faut au moins un adulte, et un nombre d'enfants positif ou nul")
    if any((getattr(m, k) or 0) < 0 for k in ("revenu_fiscal_annuel", "revenu_disponible_annuel", "revenus_nets_mensuels", "credits_mensuels", "apport")):
        raise HTTPException(422, "Les montants ne peuvent pas être négatifs")
    m.nb_personnes = m.adultes + m.nb_enfants
    m.updated_at = datetime.now(timezone.utc)


@router.post("/scenario/{sid}/menages")
def ajouter_menage(sid: int, body: MenageBody, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    _scenario(session, sid)
    m = Menage(scenario_id=sid, reference="")
    _appliquer(m, body)
    session.add(m)
    session.commit()
    session.add(AuditLog(action="brs_menage_ajout", target_type="menage", target_id=m.id, user=user.username, payload={"reference": m.reference}))
    session.commit()
    return etat(session, sid)


@router.put("/menages/{mid}")
def modifier_menage(mid: int, body: MenageBody, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    m = session.get(Menage, mid)
    if not m:
        raise HTTPException(404, "Ménage introuvable")
    if m.adultes == 1 and m.nb_personnes > m.nb_enfants + 1:
        m.adultes = m.nb_personnes - m.nb_enfants  # ménage saisi avant la refonte
    _appliquer(m, body)
    session.add(m)
    session.add(AuditLog(action="brs_menage_modification", target_type="menage", target_id=m.id, user=user.username, payload={}))
    session.commit()
    return etat(session, m.scenario_id)


@router.delete("/menages/{mid}")
def supprimer_menage(mid: int, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    m = session.get(Menage, mid)
    if not m:
        raise HTTPException(404, "Ménage introuvable")
    sid = m.scenario_id
    session.delete(m)
    session.add(AuditLog(action="brs_menage_suppression", target_type="menage", target_id=mid, user=user.username, payload={"reference": m.reference}))
    session.commit()
    return etat(session, sid)


@router.post("/scenario/{sid}/simuler")
def simuler(sid: int, body: MenageBody, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    """Simulation d'un ménage sans l'enregistrer."""
    _auth(user)
    _scenario(session, sid)
    return brs.simuler_menage(_hypotheses(session, sid), body.model_dump())


@router.get("/scenario/{sid}/export.xlsx")
def exporter(sid: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)):
    _auth(user)
    e = etat(session, sid)
    buf = build_commercialisation(e["hypotheses"], [x["resultat"] for x in e["menages"]], e["programme"], e["scenario"]["operation_nom"])
    op = session.get(Operation, e["scenario"]["operation_id"])
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", (op.code if op else "") or f"scenario{sid}")
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="commercialisation_brs_{slug}.xlsx"'})
