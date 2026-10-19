"""« Ma journée » : tout ce qui concerne l'utilisateur connecté, en un seul appel."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, desc, select

from ..auth import get_current_user
from ..db import get_session
from ..engines.simulateur import calculer
from ..models import (
    AuditLog, Briefing, Document, EventAgenda, Operation, Phase, Simulation, Tache, TacheProjet, User,
)
from .documents import peut_lire
from .projet import planning
from .simulations import get_bareme

router = APIRouter()

PRIORITE = {"urgente": 0, "haute": 1, "normale": 2}


def _utc(d: datetime | None) -> datetime | None:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _activite(session: Session, user: User, noms: dict[str, str]) -> list[dict]:
    """Activité récente visible par l'utilisateur (objets partagés ou qui le concernent)."""
    out = []
    ops = {o.id: o.nom for o in session.exec(select(Operation)).all()}
    for a in session.exec(select(AuditLog).order_by(desc(AuditLog.at)).limit(150)).all():
        qui = "Vous" if a.user == user.username else noms.get(a.user, a.user)
        p = a.payload or {}
        texte, url = None, None
        if a.action.startswith("tache_") and a.action != "tache_creation" and a.target_id:
            t = session.get(Tache, a.target_id)
            if not t or user.username not in (t.emetteur, t.destinataire):
                continue
            verbe = {"tache_validee": "a validé", "tache_refusee": "a refusé", "tache_consultee": "a consulté",
                     "tache_signee": "a signé", "tache_faite": "a terminé", "tache_relance": "a relancé",
                     "tache_annulation": "a annulé"}.get(a.action)
            if not verbe:
                continue
            texte, url = f"{qui} {verbe} « {t.titre} »", f"/taches?id={t.id}"
        elif a.action == "tache_creation" and a.target_id:
            t = session.get(Tache, a.target_id)
            dest = p.get("destinataires") or []
            if not t or (user.username != t.emetteur and user.username not in dest):
                continue
            texte, url = f"{qui} a envoyé une demande : « {t.titre} »", f"/taches?id={t.id}"
        elif a.action in ("document_signature", "document_import") and a.target_id:
            d = session.get(Document, a.target_id)
            if not d or not peut_lire(session, d, user):
                continue
            texte = f"{qui} a signé « {d.titre} »" if a.action == "document_signature" else f"{qui} a importé « {d.titre} »"
            url = f"/documents/{d.id}"
        elif a.action == "simulation_update" and a.target_id in ops:
            texte, url = f"{qui} a mis à jour le montage financier de {ops[a.target_id]}", f"/operations/{a.target_id}/simulateur?onglet=synthese"
        elif a.action in ("planning_creation", "planning_modification") and a.target_id:
            t = session.get(TacheProjet, a.target_id)
            if not t:
                continue
            verbe = "a ajouté au planning" if a.action == "planning_creation" else "a mis à jour"
            texte = f"{qui} {verbe} « {t.titre} » ({ops.get(t.operation_id, 'opération')})"
            url = f"/operations/{t.operation_id}/projet?vue=gantt&tache={t.id}"
        elif a.action == "event_create":
            texte, url = f"{qui} a planifié « {p.get('titre', 'un événement')} »", "/agenda"
        elif a.action == "phase_update" and a.target_id:
            ph = session.get(Phase, a.target_id)
            if not ph:
                continue
            texte = f"{qui} a mis à jour la phase « {ph.nom} » ({ops.get(ph.operation_id, 'opération')})"
            url = f"/operations/{ph.operation_id}/projet?vue=phases"
        if texte:
            if texte.startswith("Vous a "):  # conjugaison à la 2e personne
                texte = "Vous avez " + texte[len("Vous a "):]
            out.append({"id": a.id, "at": _utc(a.at), "user": a.user, "texte": texte, "url": url})
        if len(out) >= 12:
            break
    return out


@router.get("")
def ma_journee(session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    if not user or not user.actif:
        raise HTTPException(401, "Authentification requise")
    maintenant = datetime.now(timezone.utc)
    auj = maintenant.date()
    noms = {u.username: (u.nom_affichage or u.username) for u in session.exec(select(User)).all()}
    operations = {o.id: o for o in session.exec(select(Operation)).all()}

    # ── À faire : tâches reçues + tâches de planning assignées
    a_faire: list[dict] = []
    for t in session.exec(select(Tache).where(Tache.destinataire == user.username).where(Tache.statut == "a_faire")).all():
        ech = _utc(t.echeance)
        doc = session.get(Document, t.document_id) if t.document_id else None
        a_faire.append({
            "kind": "tache", "id": t.id, "type": t.type_tache, "titre": t.titre, "priorite": t.priorite,
            "echeance": ech.date().isoformat() if ech else None, "en_retard": bool(ech and ech < maintenant),
            "de": noms.get(t.emetteur, t.emetteur), "document_id": t.document_id, "document_titre": doc.titre if doc else None,
            "operation_nom": operations[t.operation_id].nom if t.operation_id in operations else None,
            "url": f"/taches?id={t.id}",
        })
    planning_assigne = 0
    for tp in session.exec(select(TacheProjet).where(TacheProjet.statut != "termine")).all():
        if user.username not in (tp.assignes or []):
            continue
        planning_assigne += 1
        if tp.fin < auj or tp.debut <= auj + timedelta(days=14):
            a_faire.append({
                "kind": "planning", "id": tp.id, "type": tp.type, "titre": tp.titre, "priorite": "normale",
                "echeance": tp.fin.isoformat(), "debut": tp.debut.isoformat(), "en_retard": tp.fin < auj,
                "avancement": tp.avancement, "statut": tp.statut, "operation_id": tp.operation_id,
                "operation_nom": operations[tp.operation_id].nom if tp.operation_id in operations else None,
                "url": f"/operations/{tp.operation_id}/projet?vue=gantt&tache={tp.id}",
            })
    a_faire.sort(key=lambda x: (not x["en_retard"], PRIORITE.get(x["priorite"], 2), x["echeance"] or "9999"))

    # ── Agenda des 7 prochains jours (mes événements + rendez-vous d'équipe structurants)
    debut_j = datetime(auj.year, auj.month, auj.day, tzinfo=timezone.utc)
    agenda = []
    for e in session.exec(select(EventAgenda).where(EventAgenda.debut >= debut_j - timedelta(hours=14))
                          .where(EventAgenda.debut < debut_j + timedelta(days=8)).order_by(EventAgenda.debut)).all():
        moi = e.organisateur == user.username or user.username in (e.participants or [])
        if moi or e.type_event != "rdv":
            agenda.append({"id": e.id, "titre": e.titre, "debut": _utc(e.debut), "fin": _utc(e.fin),
                           "toute_journee": e.toute_journee, "type_event": e.type_event, "lieu": e.lieu, "moi": moi,
                           "operation_nom": operations[e.operation_id].nom if e.operation_id in operations else None})

    # ── Opérations : planning, prochain jalon, alertes du montage
    bareme = get_bareme(session)
    cartes, jalons = [], []
    for op in sorted(operations.values(), key=lambda o: o.nom):
        pl = planning(op.id, session)
        prochains = sorted([t for t in pl["taches"] if t.type == "jalon" and t.statut != "termine" and t.debut >= auj],
                           key=lambda t: t.debut)
        for j in prochains:
            if j.debut <= auj + timedelta(days=30):
                jalons.append({"id": j.id, "titre": j.titre, "date": j.debut.isoformat(), "operation_id": op.id,
                               "operation_nom": op.nom, "url": f"/operations/{op.id}/projet?vue=gantt&tache={j.id}"})
        sim = session.exec(select(Simulation).where(Simulation.operation_id == op.id)).first()
        alertes = {"danger": 0, "warn": 0}
        autof = None
        if sim:
            try:
                r = calculer(sim.data, bareme)
                for a in r["alertes"]:
                    if a["niveau"] in alertes:
                        alertes[a["niveau"]] += 1
                if r["programme"]["total"]["nb"]:  # vue complète de l'opération (avec BRS), comme le tableau de bord
                    autof = r["synthese"]["autofinancement_net_a1"]
            except Exception:  # une simulation incomplète ne doit pas bloquer l'accueil
                pass
        phase_en_cours = next((p["nom"] for p in pl["phases"] if p["statut"] == "en_cours"), None)
        cartes.append({
            "id": op.id, "nom": op.nom, "commune": op.commune, "nb_logements": op.nb_logements_total,
            "avancement": pl["projet"]["avancement"], "en_retard": pl["projet"]["nb_en_retard"],
            "phase_en_cours": phase_en_cours,
            "prochain_jalon": {"titre": prochains[0].titre, "date": prochains[0].debut.isoformat()} if prochains else None,
            "alertes": alertes, "autofinancement_a1": autof,
        })
    jalons.sort(key=lambda j: j["date"])

    briefing = session.exec(select(Briefing).where(Briefing.destinataire == user.username)
                            .where(Briefing.jour == auj.isoformat())).first()
    a_signer = sum(1 for x in a_faire if x["kind"] == "tache" and x["type"] == "signature")
    envoyees = len(session.exec(select(Tache).where(Tache.emetteur == user.username).where(Tache.statut == "a_faire")).all())
    return {
        "utilisateur": {"username": user.username, "nom": user.nom_affichage or user.username, "role": user.role},
        "date": auj.isoformat(),
        "compteurs": {
            "taches": sum(1 for x in a_faire if x["kind"] == "tache"),
            "en_retard": sum(1 for x in a_faire if x["en_retard"]),
            "a_signer": a_signer,
            "rdv_aujourdhui": sum(1 for e in agenda if e["moi"] and e["debut"].date() == auj),
            "jalons_30j": len(jalons),
            "planning_assigne": planning_assigne,
            "envoyees_en_attente": envoyees,
        },
        "a_faire": a_faire,
        "agenda": agenda,
        "jalons": jalons,
        "operations": cartes,
        "activite": _activite(session, user, noms),
        "briefing": {"id": briefing.id, "titre": briefing.titre} if briefing else None,
    }
