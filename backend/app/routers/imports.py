"""Imports batch : ménages, bilan M2, iCal agenda."""
from io import BytesIO
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from openpyxl import load_workbook

from ..db import get_session
from ..models import Menage, Scenario, Operation, EventAgenda, AuditLog, User
from ..auth import require_saisie

router = APIRouter()


@router.post("/menages/scenario/{scenario_id}")
async def import_menages_excel(
    scenario_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> dict:
    """Importe une liste de ménages candidats (première ligne = en-têtes) :
    reference | typologie | adultes | enfants | rfr_n2 | revenu_disponible_annuel | revenus_nets_mensuels | credits_mensuels | apport.
    """
    sc = session.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Scénario introuvable")

    content = await file.read()
    try:
        wb = load_workbook(BytesIO(content), data_only=True)
        ws = wb.active
    except Exception as e:
        raise HTTPException(400, f"Fichier Excel illisible : {e}")

    headers = [str(c).strip().lower() if c else "" for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]

    def col(variantes: list[str]) -> int | None:
        return next((headers.index(v) for v in variantes if v in headers), None)

    colonnes = {
        "reference": col(["reference", "référence", "ref", "réf."]),
        "typologie": col(["typologie", "typo", "logement"]),
        "adultes": col(["adultes", "nb_adultes"]),
        "enfants": col(["enfants", "nb_enfants", "enfants_moins_14"]),
        "rfr": col(["rfr_n2", "rfr", "revenu_fiscal_annuel", "revenu fiscal de référence"]),
        "dispo": col(["revenu_disponible_annuel", "revenu disponible", "revenu_disponible"]),
        "nets": col(["revenus_nets_mensuels", "revenus nets mensuels", "revenus_nets"]),
        "credits": col(["credits_mensuels", "crédits", "credits"]),
        "apport": col(["apport"]),
        "personnes": col(["nb_personnes", "personnes"]),
    }
    if colonnes["reference"] is None or colonnes["typologie"] is None:
        raise HTTPException(400, "Colonnes 'reference' et 'typologie' obligatoires")

    def val(row, cle, defaut=0.0):
        i = colonnes[cle]
        return row[i] if i is not None and i < len(row) and row[i] not in (None, "") else defaut

    created = []
    errors = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row or val(row, "reference", None) is None:
            continue
        try:
            enfants = int(val(row, "enfants", 0))
            adultes = int(val(row, "adultes", 0)) or max(int(val(row, "personnes", 1)) - enfants, 1)
            m = Menage(
                scenario_id=scenario_id,
                reference=str(val(row, "reference")),
                typologie_logement=str(val(row, "typologie", "T3")),
                adultes=adultes, nb_enfants=enfants, nb_personnes=adultes + enfants,
                revenu_fiscal_annuel=float(val(row, "rfr")),
                revenu_disponible_annuel=float(val(row, "dispo")),
                revenus_nets_mensuels=float(val(row, "nets")),
                credits_mensuels=float(val(row, "credits")),
                apport=float(val(row, "apport")),
            )
            session.add(m)
            created.append(m.reference)
        except Exception as e:
            errors.append({"ligne": i, "erreur": str(e)})

    session.add(AuditLog(
        action="menages_import", target_type="scenario", target_id=scenario_id,
        user=user.username,
        payload={"nb_crees": len(created), "nb_erreurs": len(errors), "fichier": file.filename},
    ))
    session.commit()
    return {"ok": True, "nb_crees": len(created), "crees": created, "erreurs": errors}


@router.post("/bilan/operation/{operation_id}")
async def import_bilan_excel(
    operation_id: int,
    file: UploadFile = File(...),
    nom_scenario: str = "Scénario importé Excel",
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> Scenario:
    """Importe un fichier Modèle de bilan.xls (format client) et crée un nouveau scénario.

    Attend un onglet 'RECAP' avec colonnes : POSTE | BRS | PLI | TOTAL regroupées par rubrique.
    Fallback : accepte aussi un onglet nommé 'BILAN *' avec la même structure.
    """
    op = session.get(Operation, operation_id)
    if not op:
        raise HTTPException(404, "Opération introuvable")

    content = await file.read()
    try:
        wb = load_workbook(BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(400, f"Fichier Excel illisible : {e}")

    # Chercher la bonne feuille
    ws = None
    for name in wb.sheetnames:
        if "RECAP" in name.upper():
            ws = wb[name]
            break
    if ws is None:
        ws = wb.active

    # Parcours : on détecte les lignes de rubrique (texte seul) et les lignes de poste (texte + 2-3 nombres)
    RUBRIQUES_KNOWN = {
        "FONCIER": "FONCIER",
        "TRAVAUX": "TRAVAUX BÂTIMENT",
        "HONORAIRES": "HONORAIRES BÂTIMENT",
        "COMMERCIALISATION": "COMMERCIALISATION",
        "GESTION": "GESTION ET MOD",
        "FRAIS FINANCIERS": "FRAIS FINANCIERS",
    }

    lignes = []
    current_rub = "FONCIER"
    for row in ws.iter_rows(values_only=True):
        if not row:
            continue
        libelle = str(row[0] or "").strip()
        if not libelle:
            continue
        # Détection rubrique
        up = libelle.upper()
        matched = None
        for k, v in RUBRIQUES_KNOWN.items():
            if k in up and not any(isinstance(c, (int, float)) for c in row[1:4]):
                matched = v
                break
        if matched:
            current_rub = matched
            continue
        # Ignorer les lignes "total", "prix", "marge"
        if any(w in up for w in ["TOTAL", "PRIX", "MARGE", "SUBVENTION", "RECAP"]):
            continue
        # Collecte BRS, PLI
        brs_val = row[1] if len(row) > 1 else None
        pli_val = row[2] if len(row) > 2 else None
        # Si la 2e colonne est vide mais la 3e remplit → essayer en ligne 3
        try:
            brs = float(brs_val) if brs_val not in (None, "") else 0.0
        except Exception:
            brs = 0.0
        try:
            pli = float(pli_val) if pli_val not in (None, "") else 0.0
        except Exception:
            pli = 0.0
        if brs == 0 and pli == 0:
            continue
        lignes.append({"rubrique": current_rub, "poste": libelle[:80], "brs": brs, "pli": pli, "ratio_commentaire": ""})

    if not lignes:
        raise HTTPException(400, "Aucune ligne de bilan détectée dans le fichier")

    # Reprendre les ventes/subventions du scénario référence pour ne pas tout casser
    ref = session.exec(
        select(Scenario).where(Scenario.operation_id == operation_id).where(Scenario.is_reference == True)  # noqa: E712
    ).first()
    ventes = (ref.hypotheses or {}).get("ventes", []) if ref else []
    subventions = (ref.hypotheses or {}).get("subventions", []) if ref else []
    exploitation = (ref.hypotheses or {}).get("exploitation") if ref else None

    hyp = {
        "lignes": lignes,
        "ventes": ventes,
        "subventions": subventions,
    }
    if exploitation:
        hyp["exploitation"] = exploitation

    sc = Scenario(
        operation_id=operation_id,
        nom=nom_scenario,
        is_reference=False,
        hypotheses=hyp,
    )
    session.add(sc)
    session.add(AuditLog(
        action="bilan_import", target_type="operation", target_id=operation_id,
        user=user.username,
        payload={"nb_lignes": len(lignes), "fichier": file.filename, "nom_scenario": nom_scenario},
    ))
    session.commit()
    session.refresh(sc)
    return sc


# -----------------------------------------------------------------------------
# iCal / ICS pour agenda
# -----------------------------------------------------------------------------

def _parse_ics_date(s: str) -> datetime:
    """Parse les dates iCal (format YYYYMMDDTHHMMSSZ ou YYYYMMDD)."""
    s = s.strip()
    if "T" in s:
        s = s.rstrip("Z")
        try:
            dt = datetime.strptime(s, "%Y%m%dT%H%M%S")
        except ValueError:
            dt = datetime.strptime(s[:15], "%Y%m%dT%H%M%S")
        return dt.replace(tzinfo=timezone.utc)
    else:
        dt = datetime.strptime(s, "%Y%m%d")
        return dt.replace(tzinfo=timezone.utc)


@router.post("/ics")
async def import_ics(
    file: UploadFile = File(...),
    operation_id: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_saisie),
) -> dict:
    """Importe un fichier iCalendar (.ics) depuis Outlook / Google Calendar."""
    content = (await file.read()).decode("utf-8", errors="replace")

    events: list[dict] = []
    current: dict | None = None
    for raw in content.splitlines():
        line = raw.strip()
        # Gestion folding (continuation sur ligne commençant par espace) — simplifié
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current:
                events.append(current)
            current = None
        elif current is not None and ":" in line:
            key, _, value = line.partition(":")
            key = key.split(";")[0]  # ignore params (TZID, etc.)
            current[key] = value

    created: list[str] = []
    for e in events:
        if "SUMMARY" not in e or "DTSTART" not in e:
            continue
        try:
            debut = _parse_ics_date(e["DTSTART"])
            fin = _parse_ics_date(e["DTEND"]) if "DTEND" in e else None
            ev = EventAgenda(
                titre=e.get("SUMMARY", "Sans titre")[:200],
                description=e.get("DESCRIPTION", "")[:500].replace("\\n", "\n"),
                debut=debut,
                fin=fin,
                type_event="rdv",
                operation_id=operation_id,
                organisateur=user.username,
                participants=[],
                lieu=e.get("LOCATION", "")[:200],
            )
            session.add(ev)
            created.append(ev.titre)
        except Exception:
            continue
    session.add(AuditLog(
        action="agenda_import_ics", target_type="event", user=user.username,
        payload={"nb_crees": len(created), "fichier": file.filename},
    ))
    session.commit()
    return {"ok": True, "nb_crees": len(created), "crees": created}


@router.get("/menages/template.xlsx")
def menages_template():
    """Télécharge un gabarit Excel pour l'import ménages."""
    from openpyxl import Workbook
    from fastapi.responses import StreamingResponse
    wb = Workbook()
    ws = wb.active
    ws.title = "Ménages"
    ws.append(["reference", "typologie", "adultes", "enfants", "rfr_n2", "revenu_disponible_annuel",
               "revenus_nets_mensuels", "credits_mensuels", "apport"])
    ws.append(["M-100", "T3", 2, 1, 42000, 38000, 3200, 0, 15000])
    ws.append(["M-101", "T2", 1, 0, 24000, 22000, 1850, 0, 10000])
    ws.append(["M-102", "T4", 2, 3, 52000, 47000, 4100, 250, 20000])
    for col in "ABCDEFGHI":
        ws.column_dimensions[col].width = 24
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="template_menages.xlsx"'},
    )
