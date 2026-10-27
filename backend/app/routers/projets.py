"""Suivi des projets : parcours d'étapes, génération des contrats et conventions, déclenchement de la facturation."""
from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import get_current_user, require_admin, require_saisie
from ..db import get_session
from ..models import AuditLog, Document, Facture, ModeleDocument, Operation, Projet, Referentiel, User
from ..notifier import notifier
from .. import projets_outils as outils

router = APIRouter()

STATUTS_PROJET = {"en_cours", "termine", "suspendu", "abandonne"}
STATUTS_ETAPE = {"a_venir", "en_cours", "terminee"}


# ─────────────────────────────────────────────── paramètres (référentiels internes)
def _ref(session: Session, code: str, label: str, defaut: dict) -> Referentiel:
    r = session.exec(select(Referentiel).where(Referentiel.code == code)).first()
    if not r:
        r = Referentiel(code=code, label=label, data=defaut)
        session.add(r)
        session.commit()
        session.refresh(r)
    return r


def identite(session: Session) -> dict:
    return outils.fusion(outils.IDENTITE_DEFAUT, _ref(session, "identite_scic", "Identité de la SCIC", outils.IDENTITE_DEFAUT).data)


def parcours(session: Session) -> dict:
    return _ref(session, "parcours_projet", "Parcours type des projets", outils.PARCOURS_DEFAUT).data


def seed_parcours() -> None:
    """Le parcours provisoire (jamais enregistré par un administrateur) est remplacé par le parcours transmis par la SCIC."""
    from ..db import engine
    with Session(engine) as session:
        r = session.exec(select(Referentiel).where(Referentiel.code == "parcours_projet")).first()
        if r and (r.data or {}).get("provisoire"):
            r.data = outils.PARCOURS_DEFAUT
            r.updated_at = datetime.now(timezone.utc)
            session.add(r)
            session.commit()


def seed_modeles() -> None:
    from ..db import engine
    with Session(engine) as session:
        existants = set(session.exec(select(ModeleDocument.titre)).all())
        for m in outils.MODELES_DEFAUT:
            if m["titre"] not in existants:
                session.add(ModeleDocument(titre=m["titre"], categorie=m["categorie"], contenu=m["contenu"], updated_by="system"))
        session.commit()


def _auth(user: User | None) -> User:
    if not user or not user.actif:
        raise HTTPException(401, "Authentification requise")
    return user


def _noms(session: Session) -> dict[str, str]:
    return {u.username: u.nom_affichage or u.username for u in session.exec(select(User)).all()}


def _admins(session: Session) -> list[str]:
    return [u.username for u in session.exec(select(User).where(User.role == "admin").where(User.actif == True)).all()]  # noqa: E712


def _projet(session: Session, pid: int) -> Projet:
    p = session.get(Projet, pid)
    if not p:
        raise HTTPException(404, "Projet introuvable")
    return p


def _factures_par_etape(session: Session, pid: int) -> dict[str, Facture]:
    out: dict[str, Facture] = {}
    for f in session.exec(select(Facture).where(Facture.projet_id == pid).where(Facture.type == "facture")).all():
        if f.statut != "annulee" and f.etape_id:
            out[f.etape_id] = f
    return out


def vue(session: Session, p: Projet, detail: bool = False) -> dict:
    noms = _noms(session)
    factures = list(session.exec(select(Facture).where(Facture.projet_id == p.id)).all())
    par_etape = _factures_par_etape(session, p.id)
    etapes = []
    for e in p.etapes or []:
        f = par_etape.get(e["id"])
        r = outils.regle(e)
        etapes.append({**e, "phase": e.get("phase") or "", "facturation": r, "montant_ht": outils.montant_etape(p, e),
                       "regle_libelle": outils.libelle_regle(r), "payeur_nom": outils.tiers(p, r["payeur"])["nom"],
                       "facture": {"id": f.id, "numero": f.numero, "statut": f.statut, "total_ttc": f.total_ttc} if f else None})
    facturables = [e for e in etapes if e["facturation"]["mode"] != "aucune" and e["facturation"]["nature"] == "facture"]
    financements = [{"etape_id": e["id"], "nom": e["nom"], "montant": e["montant_ht"], "financeur": e["payeur_nom"], "obtenu": e["statut"] == "terminee"}
                    for e in etapes if e["facturation"]["mode"] != "aucune" and e["facturation"]["nature"] == "financement"]
    # facturé = factures émises ou payées ; une facture annulée par un avoir n'est plus comptée
    facture_ht = sum(f.total_ht for f in factures if f.type == "facture" and f.statut in ("emise", "payee"))
    paye_ttc = sum(f.total_ttc for f in factures if f.statut == "payee")
    nb_term = sum(1 for e in etapes if e["statut"] == "terminee")
    op = session.get(Operation, p.operation_id) if p.operation_id else None
    d = {
        **p.model_dump(exclude={"etapes", "documents"}),
        "etapes": etapes,
        "responsable_nom": noms.get(p.responsable, p.responsable),
        "operation_nom": op.nom if op else None,
        "avancement": round(nb_term * 100 / len(etapes)) if etapes else 0,
        "nb_etapes": len(etapes), "nb_etapes_terminees": nb_term,
        "etape_en_cours": next((e["nom"] for e in etapes if e["statut"] == "en_cours"), None),
        "phase_en_cours": next((e["phase"] for e in etapes if e["statut"] == "en_cours"), None),
        "total_facturable_ht": round(sum(e["montant_ht"] for e in facturables), 2),
        # part des honoraires du contrat déjà répartie sur des étapes (le reste n'a pas encore d'échéance)
        "part_honoraires_planifiee": round(sum(e["facturation"]["taux"] for e in facturables
                                               if e["facturation"]["mode"] == "pourcentage" and e["facturation"]["base"] == "honoraires"), 6),
        "financements": financements,
        "facture_ht": round(facture_ht, 2), "paye_ttc": round(paye_ttc, 2),
        "reste_a_facturer_ht": round(max(0.0, sum(e["montant_ht"] for e in facturables) - facture_ht), 2),
        "tiers": {k: outils.tiers(p, k) for k in ("collectivite", "promoteur", "financeur")},
        "nb_brouillons": sum(1 for f in factures if f.statut == "brouillon"),
    }
    if detail:
        docs = []
        for x in p.documents or []:
            doc = session.get(Document, x["document_id"])
            if doc:
                docs.append({**x, "statut": doc.statut, "titre": doc.titre, "par_nom": noms.get(x.get("par", ""), x.get("par", ""))})
        d["documents"] = docs
        d["factures"] = [{"id": f.id, "numero": f.numero, "type": f.type, "statut": f.statut, "objet": f.objet, "total_ttc": f.total_ttc,
                          "date_emission": f.date_emission, "date_echeance": f.date_echeance, "etape_id": f.etape_id}
                         for f in sorted(factures, key=lambda f: f.id)]
    return d


def _nouveau_code(session: Session) -> str:
    an = date.today().year
    n = 0
    for c in session.exec(select(Projet.code).where(Projet.code.like(f"PRJ-{an}-%"))).all():
        try:
            n = max(n, int(c.rsplit("-", 1)[1]))
        except ValueError:
            pass
    return f"PRJ-{an}-{n + 1:03d}"


def _etapes_depuis_parcours(session: Session) -> list[dict]:
    titres = {m.titre: m.id for m in session.exec(select(ModeleDocument).where(ModeleDocument.actif == True)).all()}  # noqa: E712
    out = []
    for i, e in enumerate(parcours(session).get("etapes", [])):
        out.append({"id": uuid4().hex[:8], "phase": e.get("phase", ""), "nom": e.get("nom", f"Étape {i + 1}"), "description": e.get("description", ""),
                    "facturation": outils.regle(e), "statut": "en_cours" if i == 0 else "a_venir",
                    "date_prevue": None, "date_realisation": None,
                    "modeles": [titres[t] for t in e.get("modeles", []) if t in titres]})
    return out


def _normaliser_etapes(etapes: list[dict], anciennes: list[dict]) -> list[dict]:
    precedentes = {e["id"]: e for e in anciennes}
    out = []
    for e in etapes:
        if not str(e.get("nom", "")).strip():
            raise HTTPException(422, "Chaque étape doit avoir un nom")
        regle = _regle_valide(e)
        ancienne = precedentes.get(e.get("id") or "", {})
        statut = e.get("statut") or ancienne.get("statut") or "a_venir"
        if statut not in STATUTS_ETAPE:
            raise HTTPException(422, f"Statut d'étape inconnu : {statut}")
        out.append({"id": e.get("id") or uuid4().hex[:8], "phase": str(e.get("phase") or "")[:120], "nom": str(e["nom"]).strip()[:200],
                    "description": str(e.get("description", ""))[:1000], "facturation": regle, "statut": statut, "date_prevue": e.get("date_prevue") or None,
                    "date_realisation": ancienne.get("date_realisation") if statut == "terminee" else None,
                    "modeles": [int(x) for x in e.get("modeles", []) if str(x).isdigit()]})
    _controle_honoraires(out)
    return out


def _regle_valide(e: dict) -> dict:
    brute = e.get("facturation")
    if isinstance(brute, dict) and brute.get("mode") not in (None, "aucune", "forfait", "pourcentage"):
        raise HTTPException(422, f"Mode de facturation inconnu : {brute.get('mode')}")
    r = outils.regle(e)
    if r["mode"] == "pourcentage" and not 0 < r["taux"] <= 1:
        raise HTTPException(422, f"Étape « {e.get('nom', '')} » : le pourcentage doit être compris entre 0 et 100 %")
    return r


def _controle_honoraires(etapes: list[dict]) -> None:
    part = sum(e["facturation"]["taux"] for e in etapes if e["facturation"]["mode"] == "pourcentage"
               and e["facturation"]["base"] == "honoraires" and e["facturation"]["nature"] == "facture")
    if part > 1.000001:
        raise HTTPException(422, "Les étapes facturent plus de 100 % des honoraires")


def _honoraires(p: Projet) -> None:
    """Quand le chiffre d'affaires prévisionnel est connu, les honoraires suivent le taux du contrat."""
    if float(p.ca_previsionnel_ttc or 0) > 0:
        p.montant_ht = round(float(p.ca_previsionnel_ttc) * float(p.taux_honoraires or 0), 2)


def _tiers_valides(tiers: dict | None) -> dict:
    out = {}
    for k, v in (tiers or {}).items():
        if k not in ("collectivite", "promoteur", "financeur"):
            raise HTTPException(422, f"Partie inconnue : {k}")
        out[k] = {c: str((v or {}).get(c) or "").strip()[:300] for c in ("nom", "adresse", "siren", "contact", "email")}
    return out


# ─────────────────────────────────────────────── projets
class ProjetBody(BaseModel):
    nom: str | None = None
    client_nom: str | None = None
    client_adresse: str | None = None
    client_siren: str | None = None
    client_contact: str | None = None
    client_email: str | None = None
    operation_id: int | None = None
    responsable: str | None = None
    montant_ht: float | None = None
    taux_tva: float | None = None
    ca_previsionnel_ttc: float | None = None
    taux_honoraires: float | None = None
    tiers: dict | None = None
    statut: str | None = None
    date_debut: date | None = None
    notes: str | None = None
    etapes: list[dict] | None = None


@router.get("")
def lister(session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> list[dict]:
    _auth(user)
    return [vue(session, p) for p in session.exec(select(Projet).order_by(Projet.id.desc())).all()]


@router.post("")
def creer(body: ProjetBody, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    if not (body.nom or "").strip():
        raise HTTPException(422, "Le nom du projet est obligatoire")
    p = Projet(code=_nouveau_code(session), nom=body.nom.strip()[:200], cree_par=user.username,
               responsable=body.responsable or user.username, date_debut=body.date_debut or date.today())
    for k in ("client_nom", "client_adresse", "client_siren", "client_contact", "client_email", "operation_id", "montant_ht", "taux_tva",
              "ca_previsionnel_ttc", "taux_honoraires", "notes"):
        v = getattr(body, k)
        if v is not None:
            setattr(p, k, v)
    p.tiers = _tiers_valides(body.tiers)
    _honoraires(p)
    p.etapes = _normaliser_etapes(body.etapes, []) if body.etapes else _etapes_depuis_parcours(session)
    session.add(p)
    session.commit()
    session.refresh(p)
    notifier(session, p.responsable, f"Projet confié : {p.nom}", f"{p.code} — client {p.client_nom or 'à préciser'}.",
             type_notif="mention", url=f"/projets/{p.id}", emise_par=user.username, target_type="projet", target_id=p.id)
    session.add(AuditLog(action="projet_creation", target_type="projet", target_id=p.id, user=user.username,
                         payload={"code": p.code, "nom": p.nom}))
    session.commit()
    return vue(session, p, detail=True)


@router.get("/parcours")
def lire_parcours(session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    _auth(user)
    data = parcours(session)
    return {**data, "etapes": [{**e, "phase": e.get("phase", ""), "facturation": outils.regle(e)} for e in data.get("etapes", [])]}


class ParcoursBody(BaseModel):
    etapes: list[dict]
    provisoire: bool = False


@router.put("/parcours")
def enregistrer_parcours(body: ParcoursBody, session: Session = Depends(get_session), user: User = Depends(require_admin)) -> dict:
    etapes = []
    for e in body.etapes:
        if not str(e.get("nom", "")).strip():
            raise HTTPException(422, "Chaque étape doit avoir un nom")
        etapes.append({"phase": str(e.get("phase") or "").strip(), "nom": str(e["nom"]).strip(), "description": str(e.get("description", "")),
                       "facturation": _regle_valide(e), "modeles": [str(t) for t in e.get("modeles", [])]})
    _controle_honoraires(etapes)
    r = _ref(session, "parcours_projet", "Parcours type des projets", outils.PARCOURS_DEFAUT)
    r.data = {"provisoire": body.provisoire, "etapes": etapes}
    r.updated_at = datetime.now(timezone.utc)
    session.add(r)
    session.add(AuditLog(action="parcours_modification", target_type="referentiel", target_id=r.id, user=user.username,
                         payload={"nb_etapes": len(etapes)}))
    session.commit()
    return r.data


@router.get("/identite")
def lire_identite(session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    return identite(session)


@router.put("/identite")
def enregistrer_identite(body: dict, session: Session = Depends(get_session), user: User = Depends(require_admin)) -> dict:
    r = _ref(session, "identite_scic", "Identité de la SCIC", outils.IDENTITE_DEFAUT)
    data = {k: body[k] for k in outils.IDENTITE_DEFAUT if k in body}
    try:
        data["delai_paiement_jours"] = int(data.get("delai_paiement_jours", r.data.get("delai_paiement_jours", 30)))
    except (TypeError, ValueError):
        raise HTTPException(422, "Délai de paiement invalide")
    r.data = outils.fusion(outils.IDENTITE_DEFAUT, {**r.data, **data})
    r.updated_at = datetime.now(timezone.utc)
    session.add(r)
    session.add(AuditLog(action="identite_modification", target_type="referentiel", target_id=r.id, user=user.username, payload={}))
    session.commit()
    return r.data


# ─────────────────────────────────────────────── modèles de documents
class ModeleBody(BaseModel):
    titre: str | None = None
    categorie: str | None = None
    contenu: str | None = None
    actif: bool | None = None


@router.get("/modeles")
def lister_modeles(session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    _auth(user)
    return {"modeles": list(session.exec(select(ModeleDocument).order_by(ModeleDocument.titre)).all()),
            "champs": [{"cle": k, "libelle": l} for k, l in outils.CHAMPS]}


@router.post("/modeles")
def creer_modele(body: ModeleBody, session: Session = Depends(get_session), user: User = Depends(require_admin)) -> ModeleDocument:
    if not (body.titre or "").strip():
        raise HTTPException(422, "Le titre du modèle est obligatoire")
    m = ModeleDocument(titre=body.titre.strip()[:200], categorie=body.categorie or "convention", contenu=body.contenu or "# " + body.titre.strip(),
                       updated_by=user.username)
    session.add(m)
    session.commit()
    session.refresh(m)
    return m


@router.put("/modeles/{mid}")
def modifier_modele(mid: int, body: ModeleBody, session: Session = Depends(get_session), user: User = Depends(require_admin)) -> ModeleDocument:
    m = session.get(ModeleDocument, mid)
    if not m:
        raise HTTPException(404, "Modèle introuvable")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(m, k, v.strip()[:200] if k == "titre" else v)
    m.updated_by, m.updated_at = user.username, datetime.now(timezone.utc)
    session.add(m)
    session.add(AuditLog(action="modele_modification", target_type="modele_document", target_id=m.id, user=user.username,
                         payload={"titre": m.titre}))
    session.commit()
    session.refresh(m)
    return m


@router.delete("/modeles/{mid}")
def supprimer_modele(mid: int, session: Session = Depends(get_session), user: User = Depends(require_admin)) -> dict:
    m = session.get(ModeleDocument, mid)
    if not m:
        raise HTTPException(404, "Modèle introuvable")
    session.delete(m)
    session.commit()
    return {"ok": True}


class ApercuBody(BaseModel):
    contenu: str
    titre: str = "Aperçu"
    projet_id: int | None = None


def _projet_exemple() -> Projet:
    return Projet(code="PRJ-2026-000", nom="Projet d'exemple", client_nom="Coopérative d'habitants Les Tilleuls",
                  client_adresse="12 rue des Lilas, 94310 Orly", client_siren="000 000 000", client_contact="Mme Exemple, présidente",
                  montant_ht=144_000, taux_tva=0.2, ca_previsionnel_ttc=4_800_000, taux_honoraires=0.03, date_debut=date.today(),
                  tiers={"collectivite": {"nom": "Ville d'Orly", "adresse": "7 avenue Adrien-Raynal, 94310 Orly", "contact": "M. le Maire"},
                         "promoteur": {"nom": "Promoteur Exemple SAS", "adresse": "1 rue de l'Exemple, 75000 Paris", "contact": "Directeur des programmes"},
                         "financeur": {"nom": "CNAV"}},
                  etapes=[{**e, "id": str(i), "statut": "a_venir"} for i, e in enumerate(outils.PARCOURS_DEFAUT["etapes"])])


@router.post("/modeles/apercu")
def apercu_modele(body: ApercuBody, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> Response:
    p = _projet(session, body.projet_id) if body.projet_id else _projet_exemple()
    pdf = _generer_pdf(session, p, body.titre, body.contenu)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="apercu.pdf"'})


def _generer_pdf(session: Session, p: Projet, titre: str, contenu: str, etape: dict | None = None) -> bytes:
    op = session.get(Operation, p.operation_id) if p.operation_id else None
    ident = identite(session)
    valeurs = outils.valeurs_champs(p, ident, op, _noms(session).get(p.responsable, p.responsable), etape)
    return outils.document_pdf(titre, outils.remplir(contenu, valeurs), p, ident)


# ─────────────────────────────────────────────── plans d'action et modélisation de la foncière
STATUTS_ACTION = {"a_lancer", "en_cours", "fait"}


@router.get("/plans-action")
def lire_plans_action(session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    _auth(user)
    return _plans(session).data


def _plans(session: Session) -> Referentiel:
    defaut = {**outils.PLANS_ACTION_DEFAUT,
              "actions": [{"id": uuid4().hex[:8], "statut": "a_lancer", "responsable": "", "echeance": None, "detail": "", **a}
                          for a in outils.PLANS_ACTION_DEFAUT["actions"]]}
    return _ref(session, "plans_action", "Plans d'action de la SCIC", defaut)


@router.put("/plans-action")
def enregistrer_plans_action(body: dict, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    actions = []
    for a in body.get("actions") or []:
        if not str(a.get("titre") or "").strip():
            raise HTTPException(422, "Chaque action doit avoir un intitulé")
        if (a.get("statut") or "a_lancer") not in STATUTS_ACTION:
            raise HTTPException(422, f"Statut d'action inconnu : {a.get('statut')}")
        actions.append({"id": a.get("id") or uuid4().hex[:8], "axe": str(a.get("axe") or "Divers").strip()[:60],
                        "titre": str(a["titre"]).strip()[:200], "detail": str(a.get("detail") or "")[:1000],
                        "statut": a.get("statut") or "a_lancer", "responsable": str(a.get("responsable") or ""),
                        "echeance": a.get("echeance") or None})
    f = body.get("fonciere") or {}
    try:
        fonciere = {"taux_fonds_propres": float(f.get("taux_fonds_propres") or 0), "cout_moyen_logement": float(f.get("cout_moyen_logement") or 0),
                    "annees": [{"annee": int(x["annee"]), "idf_projets": int(x.get("idf_projets") or 0), "idf_logements": int(x.get("idf_logements") or 0),
                                "idf_detail": str(x.get("idf_detail") or "")[:200], "hors_idf_projets": int(x.get("hors_idf_projets") or 0),
                                "hors_idf_logements": int(x.get("hors_idf_logements") or 0)} for x in f.get("annees") or []]}
    except (TypeError, ValueError, KeyError):
        raise HTTPException(422, "Modélisation de la foncière : valeurs invalides")
    if not 0 <= fonciere["taux_fonds_propres"] <= 1:
        raise HTTPException(422, "Le taux de fonds propres doit être compris entre 0 et 100 %")
    r = _plans(session)
    r.data = {"actions": actions, "fonciere": fonciere}
    r.updated_at = datetime.now(timezone.utc)
    session.add(r)
    session.add(AuditLog(action="plans_action_modification", target_type="referentiel", target_id=r.id, user=user.username,
                         payload={"nb_actions": len(actions)}))
    session.commit()
    return r.data


# ─────────────────────────────────────────────── projet (suite)
@router.get("/{pid}")
def lire(pid: int, session: Session = Depends(get_session), user: User | None = Depends(get_current_user)) -> dict:
    _auth(user)
    return vue(session, _projet(session, pid), detail=True)


@router.put("/{pid}")
def modifier(pid: int, body: ProjetBody, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    p = _projet(session, pid)
    data = body.model_dump(exclude_unset=True)
    if "statut" in data and data["statut"] not in STATUTS_PROJET:
        raise HTTPException(422, "Statut de projet inconnu")
    if "nom" in data and not (data["nom"] or "").strip():
        raise HTTPException(422, "Le nom du projet est obligatoire")
    if "etapes" in data:
        verrouillees = {k for k, f in _factures_par_etape(session, p.id).items() if f.statut != "brouillon"}
        nouvelles = _normaliser_etapes(data.pop("etapes") or [], p.etapes or [])
        ids = {e["id"] for e in nouvelles}
        if verrouillees - ids:
            raise HTTPException(409, "Une étape déjà facturée ne peut pas être supprimée")
        anciennes = {e["id"]: e for e in p.etapes or []}
        for e in nouvelles:
            if e["id"] in verrouillees and e["facturation"] != outils.regle(anciennes[e["id"]]):
                raise HTTPException(409, f"L'étape « {e['nom']} » est déjà facturée : sa règle de facturation ne peut plus changer")
        p.etapes = nouvelles
    if "tiers" in data:
        data["tiers"] = {**(p.tiers or {}), **_tiers_valides(data["tiers"])}
    verrouillees = {k for k, f in _factures_par_etape(session, p.id).items() if f.statut != "brouillon"}
    avant = {e["id"]: outils.montant_etape(p, e) for e in p.etapes or [] if e["id"] in verrouillees}
    ancien_resp = p.responsable
    for k, v in data.items():
        setattr(p, k, v.strip() if isinstance(v, str) and k == "nom" else v)
    _honoraires(p)
    if any(abs(outils.montant_etape(p, e) - avant[e["id"]]) > 0.005 for e in p.etapes or [] if e["id"] in avant):
        session.rollback()
        raise HTTPException(409, "Des étapes sont déjà facturées : ces montants ne peuvent plus changer (établissez un avenant)")
    p.updated_at = datetime.now(timezone.utc)
    session.add(p)
    if p.responsable and p.responsable != ancien_resp:
        notifier(session, p.responsable, f"Projet confié : {p.nom}", p.code, type_notif="mention", url=f"/projets/{p.id}",
                 emise_par=user.username, target_type="projet", target_id=p.id)
    session.add(AuditLog(action="projet_modification", target_type="projet", target_id=p.id, user=user.username,
                         payload={"champs": sorted(body.model_dump(exclude_unset=True))}))
    session.commit()
    session.refresh(p)
    return vue(session, p, detail=True)


@router.delete("/{pid}")
def supprimer(pid: int, session: Session = Depends(get_session), user: User = Depends(require_admin)) -> dict:
    p = _projet(session, pid)
    factures = session.exec(select(Facture).where(Facture.projet_id == pid)).all()
    if any(f.statut != "brouillon" for f in factures):
        raise HTTPException(409, "Ce projet a des factures émises : il ne peut pas être supprimé (passez-le en « abandonné »)")
    for f in factures:
        session.delete(f)
    session.delete(p)
    session.add(AuditLog(action="projet_suppression", target_type="projet", target_id=pid, user=user.username, payload={"code": p.code}))
    session.commit()
    return {"ok": True}


class StatutEtapeBody(BaseModel):
    statut: str
    date_realisation: date | None = None


@router.post("/{pid}/etapes/{eid}/statut")
def statut_etape(pid: int, eid: str, body: StatutEtapeBody, session: Session = Depends(get_session),
                 user: User = Depends(require_saisie)) -> dict:
    """Changer le statut d'une étape. Une étape terminée déclenche une facture en brouillon (part × honoraires)."""
    if body.statut not in STATUTS_ETAPE:
        raise HTTPException(422, "Statut d'étape inconnu")
    p = _projet(session, pid)
    etapes = [dict(e) for e in p.etapes or []]
    idx = next((i for i, e in enumerate(etapes) if e["id"] == eid), None)
    if idx is None:
        raise HTTPException(404, "Étape introuvable")
    e = etapes[idx]
    existante = _factures_par_etape(session, pid).get(eid)
    facture = None
    if body.statut != "terminee" and existante:
        if existante.statut != "brouillon":
            raise HTTPException(409, f"L'étape est déjà facturée (facture {existante.numero}) : elle ne peut pas être rouverte")
        session.delete(existante)  # brouillon devenu sans objet
    e["statut"] = body.statut
    e["date_realisation"] = (body.date_realisation or date.today()).isoformat() if body.statut == "terminee" else None
    if body.statut == "terminee":
        # l'étape suivante démarre
        if idx + 1 < len(etapes) and etapes[idx + 1]["statut"] == "a_venir":
            etapes[idx + 1]["statut"] = "en_cours"
        regle = outils.regle(e)
        montant = outils.montant_etape(p, e)
        if montant > 0 and not existante and regle["nature"] == "facture":
            payeur = outils.tiers(p, regle["payeur"])
            lignes = [{"designation": f"{p.nom} — « {e['nom']} » ({outils.libelle_regle(regle).lower()})",
                       "quantite": 1, "prix_unitaire_ht": montant, "taux_tva": float(p.taux_tva or 0)}]
            ht, tva, ttc = outils.totaux(lignes)
            facture = Facture(projet_id=p.id, etape_id=eid, client_nom=payeur["nom"] or f"[{outils.PAYEURS[regle['payeur']].lower()} à préciser]",
                              client_adresse=payeur["adresse"], client_siren=payeur["siren"], objet=f"{p.code} — {p.nom} : {e['nom']}",
                              lignes=lignes, total_ht=ht, total_tva=tva, total_ttc=ttc, cree_par=user.username)
            session.add(facture)
    p.etapes = etapes
    if all(x["statut"] == "terminee" for x in etapes) and p.statut == "en_cours":
        p.statut = "termine"
    elif p.statut == "termine" and any(x["statut"] != "terminee" for x in etapes):
        p.statut = "en_cours"
    p.updated_at = datetime.now(timezone.utc)
    session.add(p)
    session.commit()
    if facture:
        session.refresh(facture)
        for dest in dict.fromkeys([*_admins(session), p.responsable]):
            notifier(session, dest, f"Facture à émettre — {p.nom}", f"Étape « {e['nom']} » terminée : brouillon de {outils.eur(facture.total_ttc)} TTC.",
                     type_notif="validation", url=f"/facturation?id={facture.id}", emise_par=user.username,
                     target_type="facture", target_id=facture.id)
    elif body.statut == "terminee" and p.responsable:
        regle = outils.regle(e)
        texte = (f"{e['nom']} : financement de {outils.eur(outils.montant_etape(p, e))} acquis ({outils.tiers(p, regle['payeur'])['nom'] or 'financeur'})."
                 if regle["nature"] == "financement" and regle["mode"] != "aucune" else e["nom"])
        notifier(session, p.responsable, f"Étape terminée — {p.nom}", texte, type_notif="info", url=f"/projets/{p.id}",
                 emise_par=user.username, target_type="projet", target_id=p.id)
    session.add(AuditLog(action="projet_etape", target_type="projet", target_id=p.id, user=user.username,
                         payload={"etape": e["nom"], "statut": body.statut, "facture_id": facture.id if facture else None}))
    session.commit()
    session.refresh(p)
    return vue(session, p, detail=True)


class GenererBody(BaseModel):
    modele_id: int
    etape_id: str | None = None


@router.post("/{pid}/documents")
def generer_document(pid: int, body: GenererBody, session: Session = Depends(get_session), user: User = Depends(require_saisie)) -> dict:
    """Génère un contrat ou une convention (PDF) à partir d'un modèle et le range dans le porte-documents."""
    from .documents import _enregistrer_version  # import local : évite la dépendance circulaire
    p = _projet(session, pid)
    m = session.get(ModeleDocument, body.modele_id)
    if not m:
        raise HTTPException(404, "Modèle introuvable")
    etape = next((e for e in p.etapes or [] if e["id"] == body.etape_id), None) if body.etape_id else None
    pdf = _generer_pdf(session, p, m.titre, m.contenu, etape)
    titre = f"{m.titre} — {p.nom}"[:200]
    doc = Document(titre=titre, nom_fichier=f"{p.code}_{m.titre}.pdf".replace("/", "-").replace("\\", "-"), mimetype="application/pdf",
                   proprietaire=user.username, dossier="Projets", description=f"Généré depuis le projet {p.code}",
                   operation_id=p.operation_id, version_courante=0,
                   partage_avec=[p.responsable] if p.responsable and p.responsable != user.username else [])
    session.add(doc)
    session.commit()
    session.refresh(doc)
    _enregistrer_version(session, doc, pdf, user.username, f"Généré depuis le modèle « {m.titre} »")
    p.documents = [*(p.documents or []), {"document_id": doc.id, "modele_id": m.id, "etape_id": body.etape_id, "titre": titre,
                                          "par": user.username, "at": datetime.now(timezone.utc).isoformat()}]
    session.add(p)
    session.add(AuditLog(action="projet_document", target_type="projet", target_id=p.id, user=user.username,
                         payload={"document_id": doc.id, "modele": m.titre}))
    session.commit()
    return {"document_id": doc.id, "projet": vue(session, p, detail=True)}
