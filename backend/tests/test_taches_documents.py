"""Tâches, porte-documents, signature et notifications — parcours complet par l'API."""
import base64
from datetime import datetime, timedelta, timezone
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.main import app


def _pdf(pages: int = 2) -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    for i in range(pages):
        c.drawString(72, 760, f"Convention de réservation — page {i + 1}")
        c.showPage()
    c.save()
    return buf.getvalue()


def _png_data_url() -> str:
    img = Image.new("RGBA", (300, 100), (255, 255, 255, 0))
    for x in range(20, 280):
        img.putpixel((x, 50 + (x % 20) - 10), (20, 30, 60, 255))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _h(client, user, pwd):
    r = client.post("/api/auth/login", data={"username": user, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def H(client):
    return {"saisie": _h(client, "saisie", "saisie123"), "lecture": _h(client, "lecture", "lecture123"),
            "admin": _h(client, "admin", "admin123")}


@pytest.fixture(scope="module")
def doc(client, H):
    r = client.post("/api/documents", headers=H["saisie"], data={"titre": "Convention CNAV", "dossier": "Conventions"},
                    files={"file": ("convention.pdf", _pdf(3), "application/pdf")})
    assert r.status_code == 200, r.text
    return r.json()


def _notifs(client, h):
    return client.get("/api/notifications", headers=h).json()["rows"]


def test_annuaire_accessible_a_tout_utilisateur(client, H):
    r = client.get("/api/users/annuaire", headers=H["lecture"])
    assert r.status_code == 200
    assert {"saisie", "lecture", "admin"} <= {u["username"] for u in r.json()}
    assert client.get("/api/users/annuaire").status_code == 401


def test_import_et_apercu(client, H, doc):
    assert doc["nb_pages"] == 3 and doc["est_pdf"] and doc["version_courante"] == 1
    pages = client.get(f"/api/documents/{doc['id']}/versions/1/pages", headers=H["saisie"]).json()
    assert len(pages) == 3 and round(pages[0]["largeur"]) == 595
    png = client.get(f"/api/documents/{doc['id']}/versions/1/pages/0.png?largeur=400", headers=H["saisie"])
    assert png.status_code == 200 and png.content[:4] == b"\x89PNG"


def test_faux_pdf_refuse(client, H):
    r = client.post("/api/documents", headers=H["saisie"], files={"file": ("x.pdf", b"pas un pdf", "application/pdf")})
    assert r.status_code == 400


def test_document_prive_par_defaut(client, H, doc):
    assert client.get(f"/api/documents/{doc['id']}", headers=H["lecture"]).status_code == 403
    assert all(d["id"] != doc["id"] for d in client.get("/api/documents", headers=H["lecture"]).json()["rows"])


def test_parcours_signature(client, H, doc):
    # 1. Demande de signature → notification au destinataire, document partagé automatiquement
    r = client.post("/api/taches", headers=H["saisie"], json={
        "type_tache": "signature", "titre": "Signer la convention CNAV", "destinataires": ["lecture"],
        "document_id": doc["id"], "echeance": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()})
    assert r.status_code == 200, r.text
    tache = r.json()[0]
    assert any(n["titre"].startswith("Nouvelle tâche") and n["url_action"] == f"/taches?id={tache['id']}"
               for n in _notifs(client, H["lecture"]))
    assert client.get(f"/api/documents/{doc['id']}", headers=H["lecture"]).status_code == 200
    compt = client.get("/api/taches/compteurs", headers=H["lecture"]).json()
    assert compt["a_faire"] >= 1 and compt["a_signer"] >= 1

    # 2. Ouverture → « vue le »
    d = client.get(f"/api/taches/{tache['id']}", headers=H["lecture"]).json()
    assert d["vue_at"]

    # 3. Clôturer sans avoir signé est refusé
    r = client.post(f"/api/taches/{tache['id']}/repondre", headers=H["lecture"], json={"reponse": "signee"})
    assert r.status_code == 422

    # 4. Signer sans signature enregistrée est refusé, puis enregistrement de la signature
    ann = [{"page": 2, "type": "signature", "x": 0.55, "y": 0.75, "w": 0.3, "h": 0.08},
           {"page": 2, "type": "date", "x": 0.55, "y": 0.85, "w": 0.2, "h": 0.03}]
    r = client.post(f"/api/documents/{doc['id']}/annoter", headers=H["lecture"], json={"annotations": ann, "tache_id": tache["id"]})
    assert r.status_code == 400
    assert client.put("/api/documents/ma-signature", headers=H["lecture"], json={"image": _png_data_url()}).status_code == 200

    # 5. Signature → nouvelle version, tâche clôturée, émetteur notifié
    r = client.post(f"/api/documents/{doc['id']}/annoter", headers=H["lecture"],
                    json={"annotations": ann, "tache_id": tache["id"], "version_base": 1})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2 and r.json()["statut"] == "signe"
    t = client.get(f"/api/taches/{tache['id']}", headers=H["saisie"]).json()
    assert t["statut"] == "terminee" and t["reponse"] == "signee"
    assert any("a signé" in n["titre"] for n in _notifs(client, H["saisie"]))

    det = client.get(f"/api/documents/{doc['id']}", headers=H["saisie"]).json()
    assert len(det["versions"]) == 2 and len(det["signatures"]) == 1
    assert det["signatures"][0]["pages"] == [2]
    fichier = client.get(f"/api/documents/{doc['id']}/versions/2/fichier", headers=H["saisie"])
    texte = PdfReader(BytesIO(fichier.content)).pages[2].extract_text()
    assert "Signé électroniquement" in texte

    cert = client.get(f"/api/documents/{doc['id']}/certificat.pdf", headers=H["saisie"])
    assert cert.status_code == 200 and cert.content[:4] == b"%PDF"

    # 6. Version obsolète : conflit
    r = client.post(f"/api/documents/{doc['id']}/annoter", headers=H["saisie"],
                    json={"annotations": [{"page": 0, "type": "texte", "x": 0.1, "y": 0.1, "w": 0.3, "h": 0.05, "texte": "x"}],
                          "version_base": 1})
    assert r.status_code == 409


def test_modifier_pdf_texte_masque_rotation_suppression(client, H):
    d = client.post("/api/documents", headers=H["saisie"], files={"file": ("plan.pdf", _pdf(3), "application/pdf")}).json()
    r = client.post(f"/api/documents/{d['id']}/annoter", headers=H["saisie"], json={
        "annotations": [
            {"page": 0, "type": "masque", "x": 0.1, "y": 0.05, "w": 0.6, "h": 0.04},
            {"page": 0, "type": "texte", "x": 0.1, "y": 0.05, "w": 0.6, "h": 0.04, "texte": "Montant corrigé : 12 500 €"},
            {"page": 1, "type": "coche", "x": 0.1, "y": 0.5, "w": 0.04, "h": 0.03},
            {"page": 1, "type": "surlignage", "x": 0.1, "y": 0.2, "w": 0.5, "h": 0.03},
        ],
        "rotations": {"1": 90}, "pages_supprimees": [2]})
    assert r.status_code == 200, r.text
    assert r.json()["nb_pages"] == 2 and r.json()["statut"] == "brouillon"
    pdf = PdfReader(BytesIO(client.get(f"/api/documents/{d['id']}/versions/2/fichier", headers=H["saisie"]).content))
    assert "12 500" in pdf.pages[0].extract_text()
    assert pdf.pages[1].rotation == 90


def test_validation_refus_motive_et_notification(client, H, doc):
    t = client.post("/api/taches", headers=H["lecture"], json={
        "type_tache": "validation", "titre": "Valider le plan de financement", "destinataires": ["saisie", "admin"],
        "priorite": "urgente"}).json()
    assert len(t) == 2 and t[0]["groupe"] == t[1]["groupe"]
    tid = next(x["id"] for x in t if x["destinataire"] == "saisie")
    assert client.post(f"/api/taches/{tid}/repondre", headers=H["saisie"], json={"reponse": "refusee"}).status_code == 422
    assert client.post(f"/api/taches/{tid}/repondre", headers=H["saisie"], json={"reponse": "consultee"}).status_code == 422
    r = client.post(f"/api/taches/{tid}/repondre", headers=H["saisie"], json={"reponse": "refusee", "commentaire": "Prêt PLS < 50 %"})
    assert r.status_code == 200 and r.json()["statut"] == "refusee"
    assert any("a refusé" in n["titre"] and "PLS" in n["message"] for n in _notifs(client, H["lecture"]))
    # Suivi côté émetteur : 2 destinataires dans le même envoi
    d = client.get(f"/api/taches/{tid}", headers=H["lecture"]).json()
    assert len(d["groupe_taches"]) == 2
    # Seul le destinataire peut répondre ; relance et annulation par l'émetteur
    autre = next(x["id"] for x in t if x["destinataire"] == "admin")
    assert client.post(f"/api/taches/{autre}/repondre", headers=H["lecture"], json={"reponse": "validee"}).status_code == 404
    assert client.post(f"/api/taches/{autre}/relancer", headers=H["lecture"]).status_code == 200
    assert any(n["titre"].startswith("Relance") for n in _notifs(client, H["admin"]))
    assert client.post(f"/api/taches/{autre}/annuler", headers=H["lecture"]).status_code == 200


def test_retard_notifie_une_seule_fois(client, H):
    client.post("/api/taches", headers=H["saisie"], json={
        "type_tache": "consultation", "titre": "Lire le compte rendu COPIL", "destinataires": ["lecture"],
        "echeance": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()})
    c1 = client.get("/api/taches/compteurs", headers=H["lecture"]).json()
    assert c1["en_retard"] >= 1
    n1 = sum(1 for n in _notifs(client, H["lecture"]) if n["titre"] == "Tâche en retard : Lire le compte rendu COPIL")
    client.get("/api/taches/compteurs", headers=H["lecture"])
    n2 = sum(1 for n in _notifs(client, H["lecture"]) if n["titre"] == "Tâche en retard : Lire le compte rendu COPIL")
    assert n1 == n2 == 1


def test_signature_exige_pdf_et_destinataire_connu(client, H):
    assert client.post("/api/taches", headers=H["saisie"], json={
        "type_tache": "signature", "titre": "x", "destinataires": ["lecture"]}).status_code == 422
    assert client.post("/api/taches", headers=H["saisie"], json={
        "type_tache": "validation", "titre": "x", "destinataires": ["inconnu"]}).status_code == 422


def test_partage_notifie(client, H):
    d = client.post("/api/documents", headers=H["saisie"], files={"file": ("cr.pdf", _pdf(1), "application/pdf")}).json()
    r = client.put(f"/api/documents/{d['id']}", headers=H["saisie"], json={"partage_avec": ["admin"]})
    assert r.status_code == 200
    assert any(n["titre"].startswith("Document partagé") for n in _notifs(client, H["admin"]))
    assert client.delete(f"/api/documents/{d['id']}", headers=H["lecture"]).status_code == 403


def test_agenda_export_ics(client, H):
    client.post("/api/agenda", headers=H["saisie"], json={"titre": "COPIL Orly", "debut": "2026-11-05T09:00:00Z",
                                                          "type_event": "copil", "participants": ["lecture"]})
    r = client.get("/api/agenda/export.ics")
    assert r.status_code == 200 and "BEGIN:VCALENDAR" in r.text and "COPIL Orly" in r.text
