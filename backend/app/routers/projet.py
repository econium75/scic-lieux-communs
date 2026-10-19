"""Suivi des opérations : planning (diagramme de Gantt) par opération, adossé aux phases de suivi."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import require_saisie
from ..db import get_session
from ..models import AuditLog, Operation, Phase, TacheProjet, User
from ..notifier import notifier
from .phases import PHASES_DEFAUT

router = APIRouter()

STATUTS = {"a_faire", "en_cours", "termine", "bloque"}
TYPES = {"tache", "jalon"}


def _jour(d: datetime | date | None) -> date | None:
    if d is None:
        return None
    return d.date() if isinstance(d, datetime) else d


def _duree(t: TacheProjet) -> int:
    return (t.fin - t.debut).days + 1


def _url(t: TacheProjet) -> str:
    return f"/operations/{t.operation_id}/projet?vue=gantt&tache={t.id}"


def _phases_calculees(phases: list[Phase], taches: list[TacheProjet]) -> list[dict]:
    """Une phase couvre ses tâches ; sans tâche, elle garde ses propres dates (début / échéance)."""
    out = []
    for p in phases:
        enfants = [t for t in taches if t.phase_id == p.id]
        debut = min((t.debut for t in enfants), default=None) or _jour(p.date_debut)
        fin = max((t.fin for t in enfants), default=None) or _jour(p.date_cible)
        if debut and not fin:
            fin = debut
        if fin and not debut:
            debut = fin
        poids = sum(_duree(t) for t in enfants if t.type == "tache")
        if poids:
            avancement = round(sum(t.avancement * _duree(t) for t in enfants if t.type == "tache") / poids)
        else:
            avancement = 100 if p.statut == "termine" else 0
        out.append({**p.model_dump(), "debut": debut, "fin": fin, "avancement": avancement,
                    "nb_taches": len(enfants), "planifiee_par_taches": bool(enfants)})
    return out


def _avec_cycle(session: Session, tache_id: int | None, deps: list[int], operation_id: int) -> bool:
    """Vrai si ajouter ces prédécesseurs créerait une boucle de dépendances."""
    if tache_id is None:
        return False
    graphe = {t.id: list(t.dependances or []) for t in session.exec(
        select(TacheProjet).where(TacheProjet.operation_id == operation_id)).all()}
    graphe[tache_id] = deps
    vus, pile = set(), list(deps)
    while pile:
        n = pile.pop()
        if n == tache_id:
            return True
        if n in vus:
            continue
        vus.add(n)
        pile.extend(graphe.get(n, []))
    return False


def _cascade(session: Session, source: TacheProjet, editeur: str, deja: set[int] | None = None) -> list[TacheProjet]:
    """Repousse les successeurs qui commenceraient avant la fin de leur prédécesseur (durée conservée)."""
    deja = deja or {source.id}
    decalees = []
    successeurs = [t for t in session.exec(select(TacheProjet).where(TacheProjet.operation_id == source.operation_id)).all()
                   if source.id in (t.dependances or []) and t.id not in deja]
    for s in successeurs:
        debut_min = source.fin + timedelta(days=0 if source.type == "jalon" else 1)
        if s.debut < debut_min:
            d = (debut_min - s.debut).days
            s.debut += timedelta(days=d)
            s.fin += timedelta(days=d)
            s.updated_at = datetime.now(timezone.utc)
            session.add(s)
            decalees.append(s)
            deja.add(s.id)
            decalees += _cascade(session, s, editeur, deja)
    return decalees


def _notifier_dates(session: Session, t: TacheProjet, editeur: str, motif: str = "") -> None:
    for u in t.assignes or []:
        notifier(session, u, f"Planning modifié : {t.titre}",
                 f"Nouvelles dates : {t.debut.strftime('%d/%m/%Y')} → {t.fin.strftime('%d/%m/%Y')}{motif}",
                 type_notif="deadline", url=_url(t), emise_par=editeur, target_type="tache_projet", target_id=t.id)


# ─────────────────────────────────────────────── lecture
@router.get("/operation/{operation_id}")
def planning(operation_id: int, session: Session = Depends(get_session)) -> dict:
    op = session.get(Operation, operation_id)
    if not op:
        raise HTTPException(404, "Opération introuvable")
    phases = list(session.exec(select(Phase).where(Phase.operation_id == operation_id).order_by(Phase.ordre)).all())
    taches = list(session.exec(select(TacheProjet).where(TacheProjet.operation_id == operation_id)
                               .order_by(TacheProjet.ordre, TacheProjet.debut, TacheProjet.id)).all())
    ph = _phases_calculees(phases, taches)
    bornes = [x for p in ph for x in (p["debut"], p["fin"]) if x] + [x for t in taches for x in (t.debut, t.fin)]
    poids = sum(_duree(t) for t in taches if t.type == "tache")
    return {
        "operation": {"id": op.id, "nom": op.nom, "code": op.code},
        "phases": ph,
        "taches": taches,
        "projet": {
            "debut": min(bornes) if bornes else None,
            "fin": max(bornes) if bornes else None,
            "avancement": round(sum(t.avancement * _duree(t) for t in taches if t.type == "tache") / poids) if poids else 0,
            "nb_taches": sum(1 for t in taches if t.type == "tache"),
            "nb_jalons": sum(1 for t in taches if t.type == "jalon"),
            "nb_terminees": sum(1 for t in taches if t.statut == "termine"),
            "nb_en_retard": sum(1 for t in taches if t.statut != "termine" and t.fin < date.today()),
        },
    }


# ─────────────────────────────────────────────── écriture
class TacheProjetBody(BaseModel):
    operation_id: int | None = None
    phase_id: int | None = None
    parent_id: int | None = None
    type: str | None = None
    titre: str | None = None
    debut: date | None = None
    fin: date | None = None
    avancement: int | None = None
    statut: str | None = None
    assignes: list[str] | None = None
    dependances: list[int] | None = None
    notes: str | None = None
    cascade: bool = True


def _valider(session: Session, t: TacheProjet) -> None:
    if not t.titre.strip():
        raise HTTPException(422, "Le titre est obligatoire")
    if t.type not in TYPES:
        raise HTTPException(422, "Type inconnu")
    if t.statut not in STATUTS:
        raise HTTPException(422, "Statut inconnu")
    if t.type == "jalon":
        t.fin = t.debut
    if t.fin < t.debut:
        raise HTTPException(422, "La date de fin précède la date de début")
    t.avancement = max(0, min(100, int(t.avancement or 0)))
    if t.statut == "termine":
        t.avancement = 100
    if t.phase_id:
        p = session.get(Phase, t.phase_id)
        if not p or p.operation_id != t.operation_id:
            raise HTTPException(422, "Phase invalide pour cette opération")
    ids = {x.id for x in session.exec(select(TacheProjet).where(TacheProjet.operation_id == t.operation_id)).all()}
    t.dependances = [d for d in dict.fromkeys(t.dependances or []) if d in ids and d != t.id]
    if _avec_cycle(session, t.id, t.dependances, t.operation_id):
        raise HTTPException(422, "Ces dépendances créeraient une boucle")
    actifs = {u.username for u in session.exec(select(User).where(User.actif == True)).all()}  # noqa: E712
    t.assignes = [u for u in dict.fromkeys(t.assignes or []) if u in actifs]


@router.post("/taches")
def creer(body: TacheProjetBody, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    if not body.operation_id or not session.get(Operation, body.operation_id):
        raise HTTPException(422, "Opération introuvable")
    if not body.debut:
        raise HTTPException(422, "La date de début est obligatoire")
    dernier = session.exec(select(TacheProjet).where(TacheProjet.operation_id == body.operation_id)
                           .order_by(TacheProjet.ordre.desc())).first()  # type: ignore[attr-defined]
    t = TacheProjet(
        operation_id=body.operation_id, phase_id=body.phase_id, parent_id=body.parent_id,
        type=body.type or "tache", titre=(body.titre or "").strip()[:200], debut=body.debut,
        fin=body.fin or body.debut, avancement=body.avancement or 0, statut=body.statut or "a_faire",
        assignes=body.assignes or [], dependances=body.dependances or [], notes=body.notes or "",
        ordre=(dernier.ordre + 1) if dernier else 0, cree_par=user.username,
    )
    _valider(session, t)
    session.add(t)
    session.commit()
    session.refresh(t)
    # Respect des dépendances à la création
    for d in t.dependances:
        pred = session.get(TacheProjet, d)
        if pred and t.debut <= pred.fin and body.cascade:
            delta = (pred.fin - t.debut).days + (0 if pred.type == "jalon" else 1)
            t.debut += timedelta(days=delta)
            t.fin += timedelta(days=delta)
    session.add(t)
    for u in t.assignes:
        notifier(session, u, f"Tâche de planning assignée : {t.titre}",
                 f"Du {t.debut.strftime('%d/%m/%Y')} au {t.fin.strftime('%d/%m/%Y')}", type_notif="mention",
                 url=_url(t), emise_par=user.username, target_type="tache_projet", target_id=t.id)
    session.add(AuditLog(action="planning_creation", target_type="tache_projet", target_id=t.id, user=user.username,
                         payload={"titre": t.titre, "operation_id": t.operation_id}))
    session.commit()
    session.refresh(t)
    return {"tache": t, "decalees": []}


@router.put("/taches/{tache_id}")
def modifier(tache_id: int, body: TacheProjetBody, session: Session = Depends(get_session),
             user: User = Depends(require_saisie)) -> dict:
    t = session.get(TacheProjet, tache_id)
    if not t:
        raise HTTPException(404, "Tâche introuvable")
    avant = {"debut": t.debut, "fin": t.fin, "assignes": list(t.assignes or []), "statut": t.statut}
    champs = body.model_dump(exclude_unset=True, exclude={"cascade", "operation_id"})
    for k, v in champs.items():
        setattr(t, k, v)
    if "statut" in champs and t.statut == "en_cours" and t.avancement == 0:
        t.avancement = 10
    _valider(session, t)
    t.updated_at = datetime.now(timezone.utc)
    session.add(t)
    decalees = _cascade(session, t, user.username) if body.cascade else []

    nouveaux = [u for u in t.assignes if u not in avant["assignes"]]
    for u in nouveaux:
        notifier(session, u, f"Tâche de planning assignée : {t.titre}",
                 f"Du {t.debut.strftime('%d/%m/%Y')} au {t.fin.strftime('%d/%m/%Y')}", type_notif="mention",
                 url=_url(t), emise_par=user.username, target_type="tache_projet", target_id=t.id)
    if (t.debut, t.fin) != (avant["debut"], avant["fin"]):
        for u in [x for x in t.assignes if x not in nouveaux]:
            notifier(session, u, f"Planning modifié : {t.titre}",
                     f"Nouvelles dates : {t.debut.strftime('%d/%m/%Y')} → {t.fin.strftime('%d/%m/%Y')}",
                     type_notif="deadline", url=_url(t), emise_par=user.username, target_type="tache_projet", target_id=t.id)
    for s in decalees:
        _notifier_dates(session, s, user.username, f" (décalée suite à « {t.titre} »)")
    if t.statut == "termine" and avant["statut"] != "termine" and t.cree_par:
        notifier(session, t.cree_par, f"Tâche terminée : {t.titre}", f"Marquée terminée par {user.nom_affichage or user.username}.",
                 type_notif="validation", url=_url(t), emise_par=user.username, target_type="tache_projet", target_id=t.id)
    session.add(AuditLog(action="planning_modification", target_type="tache_projet", target_id=t.id, user=user.username,
                         payload={"champs": sorted(champs), "decalees": [s.id for s in decalees]}))
    session.commit()
    session.refresh(t)
    return {"tache": t, "decalees": [s.id for s in decalees]}


class DecalageBody(BaseModel):
    phase_id: int
    jours: int
    cascade: bool = True


@router.post("/operation/{operation_id}/decaler-phase")
def decaler_phase(operation_id: int, body: DecalageBody, session: Session = Depends(get_session),
                  user: User = Depends(require_saisie)) -> dict:
    """Déplace d'un bloc toutes les tâches d'une phase (glisser la barre de phase)."""
    p = session.get(Phase, body.phase_id)
    if not p or p.operation_id != operation_id:
        raise HTTPException(404, "Phase introuvable")
    taches = list(session.exec(select(TacheProjet).where(TacheProjet.phase_id == p.id)).all())
    delta = timedelta(days=body.jours)
    if taches:
        for t in taches:
            t.debut += delta
            t.fin += delta
            session.add(t)
        decalees = []
        if body.cascade:
            deja = {t.id for t in taches}
            for t in taches:
                decalees += _cascade(session, t, user.username, deja)
        for t in [*taches, *decalees]:
            _notifier_dates(session, t, user.username, f" (phase « {p.nom} » déplacée)")
    else:
        utc = lambda d: d if d.tzinfo else d.replace(tzinfo=timezone.utc)  # noqa: E731 — relu sans fuseau depuis SQLite
        if p.date_debut:
            p.date_debut = utc(p.date_debut) + delta
        if p.date_cible:
            p.date_cible = utc(p.date_cible) + delta
        session.add(p)
    session.add(AuditLog(action="planning_decalage_phase", target_type="phase", target_id=p.id, user=user.username,
                         payload={"jours": body.jours}))
    session.commit()
    return {"ok": True}


@router.delete("/taches/{tache_id}")
def supprimer(tache_id: int, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    t = session.get(TacheProjet, tache_id)
    if not t:
        raise HTTPException(404, "Tâche introuvable")
    a_supprimer = {t.id}
    toutes = list(session.exec(select(TacheProjet).where(TacheProjet.operation_id == t.operation_id)).all())
    changement = True
    while changement:  # sous-tâches en cascade
        changement = False
        for x in toutes:
            if x.parent_id in a_supprimer and x.id not in a_supprimer:
                a_supprimer.add(x.id)
                changement = True
    for x in toutes:
        if x.id in a_supprimer:
            session.delete(x)
        elif set(x.dependances or []) & a_supprimer:
            x.dependances = [d for d in x.dependances if d not in a_supprimer]
            session.add(x)
    session.add(AuditLog(action="planning_suppression", target_type="tache_projet", target_id=tache_id, user=user.username,
                         payload={"titre": t.titre, "nb": len(a_supprimer)}))
    session.commit()
    return {"ok": True, "supprimees": len(a_supprimer)}


@router.get("/operation/{operation_id}/export.xlsx")
def export_excel(operation_id: int, session: Session = Depends(get_session)):
    data = planning(operation_id, session)
    wb = Workbook()
    ws = wb.active
    ws.title = "Planning"
    ws["A1"] = f"Planning — {data['operation']['nom']}"
    ws["A1"].font = Font(bold=True, size=14, color="1F3A68")
    entetes = ["N°", "Tâche", "Type", "Début", "Fin", "Durée (j)", "Avancement", "Statut", "Assignés", "Prédécesseurs"]
    for i, h in enumerate(entetes, start=1):
        c = ws.cell(row=3, column=i, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3A68")
        c.alignment = Alignment(horizontal="center")
    libelles = {"a_faire": "À faire", "en_cours": "En cours", "termine": "Terminé", "bloque": "Bloqué"}
    numeros: dict[int, str] = {}
    r = 4
    taches = data["taches"]
    cle = lambda x: (x.debut, x.ordre, x.id)  # noqa: E731 — même ordre que le diagramme de Gantt
    groupes = list(data["phases"])
    if any(t.phase_id is None for t in taches):
        groupes.append({"id": None, "nom": "Sans phase", "debut": None, "fin": None, "avancement": 0, "statut": "", "responsable": ""})
    for i, p in enumerate(groupes, start=1):
        ws.append([str(i), p["nom"], "Phase", p["debut"], p["fin"], ((p["fin"] - p["debut"]).days + 1) if p["debut"] and p["fin"] else None,
                   p["avancement"] / 100, libelles.get(p["statut"], p["statut"]), p.get("responsable") or "", ""])
        for c in ws[r]:
            c.font = Font(bold=True)
            c.fill = PatternFill("solid", fgColor="E8E6DC")
        r += 1
        j = 0
        for t in sorted([t for t in taches if t.phase_id == p["id"] and not t.parent_id], key=cle):
            j += 1
            numeros[t.id] = f"{i}.{j}"
            lignes = [(t, numeros[t.id])]
            k = 0
            for s in sorted([s for s in taches if s.parent_id == t.id], key=cle):
                k += 1
                numeros[s.id] = f"{i}.{j}.{k}"
                lignes.append((s, numeros[s.id]))
            for x, num in lignes:
                ws.append([num, ("   " if x.parent_id else "") + x.titre, "Jalon" if x.type == "jalon" else "Tâche", x.debut, x.fin,
                           _duree(x), x.avancement / 100, libelles.get(x.statut, x.statut), ", ".join(x.assignes or []), ""])
                r += 1
    # Prédécesseurs (après numérotation complète)
    for row in ws.iter_rows(min_row=4):
        num = row[0].value
        t = next((x for x in taches if numeros.get(x.id) == num), None)
        if t and t.dependances:
            row[9].value = ", ".join(numeros.get(d, str(d)) for d in t.dependances)
    for row in ws.iter_rows(min_row=4):
        row[3].number_format = row[4].number_format = "DD/MM/YYYY"
        row[6].number_format = "0%"
    for col, w in zip("ABCDEFGHIJ", (7, 46, 9, 12, 12, 10, 12, 11, 24, 14)):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "C4"
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="planning_operation_{operation_id}.xlsx"'})


# ─────────────────────────────────────────────── planning indicatif de l'opération de démonstration
PLANNING_ORLY = [
    # (phase, titre, type, début, fin, avancement, statut, prédécesseurs par index)
    ("Incubation", "Étude de faisabilité et pré-programme", "tache", "2026-01-12", "2026-03-27", 100, "termine", []),
    ("Incubation", "Accord de principe de la commune", "jalon", "2026-04-03", "2026-04-03", 100, "termine", [0]),
    ("Cadrage", "Programme détaillé PLAI / PLUS / PLS / BRS", "tache", "2026-04-06", "2026-05-29", 100, "termine", [1]),
    ("Cadrage", "Choix de la maîtrise d'œuvre", "tache", "2026-05-04", "2026-06-26", 100, "termine", [1]),
    ("Montage financier", "Simulation et plan de financement", "tache", "2026-06-01", "2026-10-30", 70, "en_cours", [2]),
    ("Montage financier", "Demandes de subventions (CNAV, AGIRC-ARCCO, fondations)", "tache", "2026-09-01", "2026-12-18", 35, "en_cours", [4]),
    ("Montage financier", "Comité d'engagement", "jalon", "2026-11-17", "2026-11-17", 0, "a_faire", [4]),
    ("Instruction permis", "Dépôt du permis de construire", "jalon", "2026-12-01", "2026-12-01", 0, "a_faire", [3]),
    ("Instruction permis", "Instruction du permis", "tache", "2026-12-02", "2027-04-30", 0, "a_faire", [7]),
    ("Instruction permis", "Purge des recours", "tache", "2027-05-03", "2027-07-30", 0, "a_faire", [8]),
    ("Chantier VEFA", "Consultation et marchés de travaux", "tache", "2027-06-01", "2027-09-24", 0, "a_faire", [8]),
    ("Chantier VEFA", "Gros œuvre", "tache", "2027-10-04", "2028-06-30", 0, "a_faire", [9, 10]),
    ("Chantier VEFA", "Second œuvre et finitions", "tache", "2028-07-03", "2029-03-30", 0, "a_faire", [11]),
    ("Chantier VEFA", "Commercialisation BRS (16 logements)", "tache", "2027-09-01", "2028-12-22", 0, "a_faire", [9]),
    ("Livraison", "Réception des travaux", "jalon", "2029-04-13", "2029-04-13", 0, "a_faire", [12]),
    ("Livraison", "Attribution des logements locatifs", "tache", "2029-01-08", "2029-04-30", 0, "a_faire", [13]),
    ("Exploitation", "Mise en exploitation et premier exercice", "tache", "2029-05-02", "2030-04-30", 0, "a_faire", [14]),
]


def seed_planning() -> None:
    """Planning indicatif pour l'opération de démonstration ECON'HOME (Orly), si elle n'en a pas."""
    from ..db import engine
    with Session(engine) as session:
        op = session.exec(select(Operation).where(Operation.code == "ORLY-ECO-2027")).first()
        if not op or session.exec(select(TacheProjet).where(TacheProjet.operation_id == op.id)).first():
            return
        phases = {p.nom: p for p in session.exec(select(Phase).where(Phase.operation_id == op.id)).all()}
        if not phases:
            for i, nom in enumerate(PHASES_DEFAUT):
                session.add(Phase(operation_id=op.id, nom=nom, ordre=i, statut="a_faire"))
            session.commit()
            phases = {p.nom: p for p in session.exec(select(Phase).where(Phase.operation_id == op.id)).all()}
        creees: list[TacheProjet] = []
        for i, (ph, titre, typ, d, f, av, st, deps) in enumerate(PLANNING_ORLY):
            t = TacheProjet(operation_id=op.id, phase_id=phases[ph].id if ph in phases else None, type=typ, titre=titre,
                            debut=date.fromisoformat(d), fin=date.fromisoformat(f), avancement=av, statut=st,
                            ordre=i, cree_par="system", notes="Planning indicatif — à ajuster.")
            session.add(t)
            session.commit()
            session.refresh(t)
            t.dependances = [creees[k].id for k in deps]
            session.add(t)
            creees.append(t)
        statut_phase = {"Incubation": "termine", "Cadrage": "termine", "Montage financier": "en_cours"}
        for nom, st in statut_phase.items():
            if nom in phases and phases[nom].statut == "a_faire":
                phases[nom].statut = st
                session.add(phases[nom])
        session.commit()
