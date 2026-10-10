"""M1 Référentiels globaux — édition via DB (plafonds BRS/PLS, taux, FiLoSoFi)."""
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from datetime import datetime, timezone
from openpyxl import load_workbook

from ..db import get_session
from ..models import Referentiel, AuditLog, User
from ..auth import require_admin, get_current_user

router = APIRouter()


DEFAULTS = [
    ("zones_brs", "Zones BRS — plafonds de vente HT/m²", {
        "1": {"libelle": "Paris", "plafond_vente_m2_ht": 5265},
        "1bis": {"libelle": "1ʳᵉ couronne IDF", "plafond_vente_m2_ht": 4094},
        "2": {"libelle": "Grandes agglos", "plafond_vente_m2_ht": 3517},
        "3": {"libelle": "Reste du territoire", "plafond_vente_m2_ht": 3078},
    }),
    ("taux_courants_pct", "Taux courants (% annuel)", {
        "ptz": 0.0, "pls": 3.80, "plus_plai": 2.60, "action_logement_1pct": 0.5,
    }),
    ("plafonds_pls_loyer_m2_mois", "Plafonds loyer PLS (€/m²/mois)", {
        "1": 13.74, "1bis": 11.80, "2": 10.26, "3": 8.50,
    }),
    ("filosofi_saint_denis_2021", "FiLoSoFi Saint-Denis 2021 — déciles annuels (€)", {
        "d1": 7020, "d2": 10760, "d3": 13200, "d4": 15640,
        "d5": 18080, "d6": 20770, "d7": 24070, "d8": 28470, "d9": 36030,
    }),
    ("uc_oecd", "Coefficients UC (OECD modifiée)", {
        "premier_adulte": 1.0, "autre_adulte_14plus": 0.5, "enfant_moins_14": 0.3,
    }),
    ("indices", "Indices macro-économiques", {
        "icc_annuel_pct": 2.0, "inflation_annuelle_pct": 2.0,
    }),
]


def _ensure_defaults(session: Session) -> None:
    existing = {r.code for r in session.exec(select(Referentiel)).all()}
    for code, label, data in DEFAULTS:
        if code not in existing:
            session.add(Referentiel(code=code, label=label, data=data))
    session.commit()


@router.get("")
def list_referentiels(session: Session = Depends(get_session)) -> list[Referentiel]:
    _ensure_defaults(session)
    return list(session.exec(select(Referentiel)).all())


@router.get("/{code}")
def get_referentiel(code: str, session: Session = Depends(get_session)) -> Referentiel:
    _ensure_defaults(session)
    r = session.exec(select(Referentiel).where(Referentiel.code == code)).first()
    if not r:
        raise HTTPException(404, f"Référentiel {code} introuvable")
    return r


@router.put("/{code}")
def update_referentiel(
    code: str,
    body: dict,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
) -> Referentiel:
    _ensure_defaults(session)
    r = session.exec(select(Referentiel).where(Referentiel.code == code)).first()
    if not r:
        raise HTTPException(404, f"Référentiel {code} introuvable")
    r.data = body
    r.updated_at = datetime.now(timezone.utc)
    session.add(r)
    session.add(AuditLog(
        action="referentiel_update",
        target_type="referentiel",
        target_id=r.id,
        user=user.username,
        payload={"code": code, "keys": list(body.keys())},
    ))
    session.commit()
    session.refresh(r)
    return r


@router.post("/{code}/upload")
def upload_excel(
    code: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
) -> dict:
    """Upload d'un fichier Excel (xlsx) pour remplacer les données d'un référentiel.

    Formats attendus :
    - Feuille 1 : colonne A = clés, colonne B = valeurs (ou colonne B/C = sous-clé/valeur pour nested)
    """
    _ensure_defaults(session)
    r = session.exec(select(Referentiel).where(Referentiel.code == code)).first()
    if not r:
        raise HTTPException(404, f"Référentiel {code} introuvable")

    content = file.file.read()
    try:
        wb = load_workbook(BytesIO(content), data_only=True)
        ws = wb.active
    except Exception as e:
        raise HTTPException(400, f"Fichier Excel illisible : {e}")

    new_data: dict = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        key = str(row[0]).strip()
        # 2 colonnes : {key: value}
        if len(row) == 2 or (len(row) >= 3 and row[2] is None):
            new_data[key] = row[1]
        # 3+ colonnes : {key: {subkey: value}} ou {key: {subkey1: v1, subkey2: v2}}
        else:
            sub = {}
            headers = []
            # Read sheet headers from row 1
            for c_idx, header_cell in enumerate(next(ws.iter_rows(min_row=1, max_row=1, values_only=True))):
                headers.append(str(header_cell) if header_cell else f"col{c_idx}")
            for c_idx, val in enumerate(row[1:], start=1):
                if val is not None and c_idx < len(headers):
                    sub[headers[c_idx]] = val
            new_data[key] = sub

    if not new_data:
        raise HTTPException(400, "Fichier vide ou format non reconnu")

    r.data = new_data
    r.updated_at = datetime.now(timezone.utc)
    session.add(r)
    session.add(AuditLog(
        action="referentiel_upload",
        target_type="referentiel",
        target_id=r.id,
        user=user.username,
        payload={"code": code, "filename": file.filename, "nb_entries": len(new_data)},
    ))
    session.commit()
    return {"ok": True, "nb_entries": len(new_data), "data": new_data}


@router.get("/{code}/template.xlsx")
def download_template(code: str, session: Session = Depends(get_session)):
    """Télécharge un gabarit Excel pré-rempli avec les valeurs actuelles pour édition."""
    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook

    _ensure_defaults(session)
    r = session.exec(select(Referentiel).where(Referentiel.code == code)).first()
    if not r:
        raise HTTPException(404, f"Référentiel {code} introuvable")

    wb = Workbook()
    ws = wb.active
    ws.title = code[:30]

    # Détecte format : simple (clé → valeur) ou nested
    sample_val = next(iter(r.data.values()), None) if r.data else None
    if isinstance(sample_val, dict):
        # nested : clé | sous-clés
        subkeys = sorted({k for v in r.data.values() if isinstance(v, dict) for k in v.keys()})
        ws.append(["clé", *subkeys])
        for k, v in r.data.items():
            if isinstance(v, dict):
                ws.append([k, *[v.get(sk) for sk in subkeys]])
    else:
        ws.append(["clé", "valeur"])
        for k, v in r.data.items():
            ws.append([k, v])

    for col_letter in "ABCDEFGH":
        ws.column_dimensions[col_letter].width = 20

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="referentiel_{code}.xlsx"'},
    )


@router.get("/zones")
def get_zones(session: Session = Depends(get_session)) -> dict:
    _ensure_defaults(session)
    r = session.exec(select(Referentiel).where(Referentiel.code == "zones_brs")).first()
    return r.data if r else {}
