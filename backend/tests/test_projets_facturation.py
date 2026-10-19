"""Suivi des projets et facturation : parcours d'étapes, documents générés, factures déclenchées par l'avancement."""
from datetime import date, timedelta
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from pypdf import PdfReader

from app.main import app


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
def projet(client, H):
    r = client.post("/api/projets", headers=H["saisie"], json={
        "nom": "Habitat participatif Les Tilleuls", "client_nom": "Coopérative Les Tilleuls", "client_adresse": "12 rue des Lilas, Orly",
        "client_siren": "123456789", "client_contact": "Mme Durand, présidente", "montant_ht": 20000, "taux_tva": 0.2, "operation_id": 1})
    assert r.status_code == 200, r.text
    return r.json()


def _texte_pdf(data: bytes) -> str:
    return " ".join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)


def test_projet_cree_avec_le_parcours_type(projet):
    assert projet["code"].startswith(f"PRJ-{date.today().year}-")
    assert len(projet["etapes"]) == 5 and projet["somme_parts"] == pytest.approx(1.0)
    assert projet["etapes"][0]["statut"] == "en_cours" and projet["etapes"][1]["statut"] == "a_venir"
    assert projet["etapes"][0]["montant_ht"] == 4000
    assert projet["operation_nom"] == "Orly Ecohome"


def test_lecture_seule_pour_le_profil_lecture(client, H, projet):
    assert client.get(f"/api/projets/{projet['id']}", headers=H["lecture"]).status_code == 200
    assert client.post("/api/projets", headers=H["lecture"], json={"nom": "x"}).status_code == 403
    assert client.get("/api/factures", headers=H["lecture"]).status_code == 403
    assert client.get("/api/projets").status_code == 401


def test_generation_convention_dans_le_porte_documents(client, H, projet):
    modeles = client.get("/api/projets/modeles", headers=H["saisie"]).json()
    conv = next(m for m in modeles["modeles"] if m["titre"] == "Convention d'accompagnement")
    assert any(c["cle"] == "client.nom" for c in modeles["champs"])
    r = client.post(f"/api/projets/{projet['id']}/documents", headers=H["saisie"], json={"modele_id": conv["id"], "etape_id": projet["etapes"][0]["id"]})
    assert r.status_code == 200, r.text
    doc_id = r.json()["document_id"]
    doc = client.get(f"/api/documents/{doc_id}", headers=H["saisie"]).json()
    assert doc["dossier"] == "Projets" and doc["est_pdf"]
    fichier = client.get(f"/api/documents/{doc_id}/versions/1/fichier", headers=H["saisie"])
    texte = _texte_pdf(fichier.content)
    assert "Coopérative Les Tilleuls" in texte and "Faire Commun" in texte
    assert "20 000,00" in texte.replace(" ", " ")  # honoraires HT
    assert "champ inconnu" not in texte
    assert r.json()["projet"]["documents"][0]["document_id"] == doc_id


def test_apercu_modele_signale_les_champs_inconnus(client, H):
    r = client.post("/api/projets/modeles/apercu", headers=H["saisie"], json={"contenu": "# Test\nBonjour {{client.nom}} {{nimporte.quoi}}"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    texte = _texte_pdf(r.content)
    assert "Coopérative d'habitants Les Tilleuls" in texte and "champ inconnu : nimporte.quoi" in texte


def test_etape_terminee_declenche_un_brouillon_de_facture(client, H, projet):
    e1 = projet["etapes"][0]
    r = client.post(f"/api/projets/{projet['id']}/etapes/{e1['id']}/statut", headers=H["saisie"], json={"statut": "terminee"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["etapes"][0]["statut"] == "terminee" and p["etapes"][1]["statut"] == "en_cours"
    f = p["etapes"][0]["facture"]
    assert f["statut"] == "brouillon" and f["total_ttc"] == 4800
    notifs = client.get("/api/notifications", headers=H["admin"]).json()["rows"]
    assert any(n["titre"].startswith("Facture à émettre") for n in notifs)
    # le même événement ne crée pas de second brouillon
    client.post(f"/api/projets/{projet['id']}/etapes/{e1['id']}/statut", headers=H["saisie"], json={"statut": "terminee"})
    assert sum(1 for x in client.get(f"/api/projets/{projet['id']}", headers=H["saisie"]).json()["factures"] if x["etape_id"] == e1["id"]) == 1


def test_emission_numerotee_et_verrouillee(client, H, projet):
    fid = client.get(f"/api/projets/{projet['id']}", headers=H["saisie"]).json()["etapes"][0]["facture"]["id"]
    assert client.post(f"/api/factures/{fid}/emettre", headers=H["saisie"]).status_code == 403  # réservé à l'administrateur
    brouillon = client.get(f"/api/factures/{fid}/pdf", headers=H["saisie"])
    assert "BROUILLON" in _texte_pdf(brouillon.content)
    r = client.post(f"/api/factures/{fid}/emettre", headers=H["admin"], json={})
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["numero"] == f"FC-{date.today().year}-0001" and f["statut"] == "emise"
    assert f["date_echeance"] == (date.today() + timedelta(days=30)).isoformat()
    texte = _texte_pdf(client.get(f"/api/factures/{fid}/pdf", headers=H["admin"]).content)
    assert f["numero"] in texte and "Pénalités de retard" in texte and "prestation de services" in texte
    assert client.put(f"/api/factures/{fid}", headers=H["admin"], json={"objet": "x"}).status_code == 409
    assert client.delete(f"/api/factures/{fid}", headers=H["admin"]).status_code == 409
    # une étape facturée ne peut plus être rouverte ni changer de part
    e1 = projet["etapes"][0]
    assert client.post(f"/api/projets/{projet['id']}/etapes/{e1['id']}/statut", headers=H["saisie"], json={"statut": "en_cours"}).status_code == 409
    p = client.get(f"/api/projets/{projet['id']}", headers=H["saisie"]).json()
    etapes = [{**e, "part": 0.1 if e["id"] == e1["id"] else e["part"]} for e in p["etapes"]]
    assert client.put(f"/api/projets/{projet['id']}", headers=H["saisie"], json={"etapes": etapes}).status_code == 409
    assert p["facture_ht"] == 4000 and p["reste_a_facturer_ht"] == 16000


def test_numerotation_continue_et_avoir(client, H, projet):
    e2 = client.get(f"/api/projets/{projet['id']}", headers=H["saisie"]).json()["etapes"][1]
    p = client.post(f"/api/projets/{projet['id']}/etapes/{e2['id']}/statut", headers=H["saisie"], json={"statut": "terminee"}).json()
    fid = p["etapes"][1]["facture"]["id"]
    f2 = client.post(f"/api/factures/{fid}/emettre", headers=H["admin"], json={}).json()
    assert f2["numero"] == f"FC-{date.today().year}-0002"
    a = client.post(f"/api/factures/{fid}/avoir", headers=H["admin"]).json()
    assert a["type"] == "avoir" and a["total_ttc"] == -f2["total_ttc"]
    assert client.post(f"/api/factures/{fid}/avoir", headers=H["admin"]).status_code == 409
    a = client.post(f"/api/factures/{a['id']}/emettre", headers=H["admin"], json={}).json()
    assert a["numero"] == f"AV-{date.today().year}-0001"
    assert client.get(f"/api/factures/{fid}", headers=H["admin"]).json()["statut"] == "annulee"
    # l'étape redevient facturable : la rouvrir puis la terminer recrée un brouillon
    client.post(f"/api/projets/{projet['id']}/etapes/{e2['id']}/statut", headers=H["saisie"], json={"statut": "en_cours"})
    p = client.post(f"/api/projets/{projet['id']}/etapes/{e2['id']}/statut", headers=H["saisie"], json={"statut": "terminee"}).json()
    assert p["etapes"][1]["facture"]["statut"] == "brouillon"


def test_paiement_retard_et_indicateurs(client, H, projet):
    p = client.get(f"/api/projets/{projet['id']}", headers=H["saisie"]).json()
    f1 = p["etapes"][0]["facture"]["id"]
    assert client.post(f"/api/factures/{f1}/payer", headers=H["admin"], json={"date_paiement": date.today().isoformat()}).json()["statut"] == "payee"
    data = client.get("/api/factures", headers=H["saisie"]).json()
    ind = data["indicateurs"]
    assert ind["encaisse_annee_ttc"] == 4800 and ind["brouillons"] >= 1
    # date d'émission antérieure à la dernière facture : refusée (ordre chronologique)
    brouillon = next(f for f in data["factures"] if f["statut"] == "brouillon" and f["type"] == "facture")
    hier = (date.today() - timedelta(days=1)).isoformat()
    assert client.post(f"/api/factures/{brouillon['id']}/emettre", headers=H["admin"], json={"date_emission": hier}).status_code == 422


def test_facture_en_retard_notifiee_une_fois(client, H):
    f = client.post("/api/factures", headers=H["admin"], json={"client_nom": "Commune d'Orly", "objet": "Étude",
                                                              "lignes": [{"designation": "Étude", "quantite": 1, "prix_unitaire_ht": 1000, "taux_tva": 0.2}]}).json()
    f = client.post(f"/api/factures/{f['id']}/emettre", headers=H["admin"], json={}).json()
    from app.db import engine
    from app.models import Facture
    from sqlmodel import Session
    with Session(engine) as s:
        x = s.get(Facture, f["id"])
        x.date_echeance = date.today() - timedelta(days=1)
        s.add(x)
        s.commit()
    client.get("/api/factures", headers=H["admin"])
    client.get("/api/factures", headers=H["admin"])
    notifs_admin = [n for n in client.get("/api/notifications?limit=100", headers=H["admin"]).json()["rows"] if f["numero"] in n["titre"]]
    assert len(notifs_admin) == 1
    assert client.get(f"/api/factures/{f['id']}", headers=H["admin"]).json()["en_retard"] is True


def test_journal_des_ventes(client, H):
    r = client.get("/api/factures/export.xlsx", headers=H["saisie"])
    assert r.status_code == 200
    ws = load_workbook(BytesIO(r.content)).active
    numeros = [c.value for c in ws["A"][1:]]
    assert numeros[0].startswith("AV-") and any(n.startswith("FC-") for n in numeros)


def test_parcours_type_modifiable_par_admin(client, H):
    assert client.put("/api/projets/parcours", headers=H["saisie"], json={"etapes": []}).status_code == 403
    r = client.put("/api/projets/parcours", headers=H["admin"], json={"etapes": [
        {"nom": "Convention", "part": 0.3, "modeles": ["Convention d'accompagnement"]}, {"nom": "Études", "part": 0.7}]})
    assert r.status_code == 200 and len(r.json()["etapes"]) == 2
    assert client.put("/api/projets/parcours", headers=H["admin"], json={"etapes": [{"nom": "A", "part": 0.8}, {"nom": "B", "part": 0.4}]}).status_code == 422
    p = client.post("/api/projets", headers=H["saisie"], json={"nom": "Projet 2", "montant_ht": 10000}).json()
    assert [e["nom"] for e in p["etapes"]] == ["Convention", "Études"] and p["etapes"][0]["modeles"]
    assert p["code"].endswith("-002")


def test_identite_et_referentiels_internes(client, H):
    ident = client.get("/api/projets/identite", headers=H["saisie"]).json()
    assert ident["raison_sociale"] == "Faire Commun"
    assert client.put("/api/projets/identite", headers=H["saisie"], json={"siret": "x"}).status_code == 403
    r = client.put("/api/projets/identite", headers=H["admin"], json={"siret": "123 456 789 00012", "delai_paiement_jours": 45})
    assert r.json()["siret"] == "123 456 789 00012" and r.json()["delai_paiement_jours"] == 45
    codes = {x["code"] for x in client.get("/api/referentiels").json()}
    assert "identite_scic" not in codes and "parcours_projet" not in codes
