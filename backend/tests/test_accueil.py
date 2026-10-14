"""« Ma journée » : agrégation personnelle, tri par urgence, confidentialité de l'activité."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _h(client, user, pwd):
    r = client.post("/api/auth/login", data={"username": user, "password": pwd})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_authentification_requise(client):
    assert client.get("/api/accueil").status_code == 401


def test_ma_journee(client):
    hs, hl = _h(client, "saisie", "saisie123"), _h(client, "lecture", "lecture123")
    hier = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    demain = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    client.post("/api/taches", headers=hs, json={"type_tache": "validation", "titre": "Valider le budget", "destinataires": ["lecture"], "echeance": demain})
    client.post("/api/taches", headers=hs, json={"type_tache": "consultation", "titre": "Lire le CR", "destinataires": ["lecture"], "echeance": hier})
    # Tâche de planning assignée au lecteur
    op = next(o["id"] for o in client.get("/api/operations").json() if o["code"] == "ORLY-ECO-2027")
    today = datetime.now(timezone.utc).date()
    client.post("/api/projet/taches", headers=hs, json={"operation_id": op, "titre": "Relire le dossier PC",
                                                          "debut": today.isoformat(), "fin": (today + timedelta(days=3)).isoformat(),
                                                          "assignes": ["lecture"]})
    # Document privé de l'éditeur : ne doit pas apparaître dans l'activité du lecteur
    client.post("/api/documents", headers=hs, data={"titre": "Note confidentielle"},
                files={"file": ("n.pdf", b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", "application/pdf")})

    r = client.get("/api/accueil", headers=hl)
    assert r.status_code == 200
    j = r.json()
    assert j["utilisateur"]["username"] == "lecture"
    titres = [x["titre"] for x in j["a_faire"]]
    assert titres.index("Lire le CR") < titres.index("Valider le budget")  # en retard d'abord
    assert "Relire le dossier PC" in titres
    assert j["compteurs"]["en_retard"] >= 1 and j["compteurs"]["planning_assigne"] >= 1
    assert j["operations"] and "avancement" in j["operations"][0]
    assert all("Note confidentielle" not in a["texte"] for a in j["activite"])
    assert any("a envoyé une demande" in a["texte"] for a in j["activite"])
