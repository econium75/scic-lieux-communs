"""Recette du moteur simulateur sur le jeu ECON'HOME (modèles Excel du client)."""
from datetime import date

import pytest

from app.engines.simulateur import (
    calculer, simulation_defaut, normaliser, valider, appliquer_bareme, prix_revient_depuis_hypotheses,
    annuite, MAX_LIGNES_SUPPLEMENTAIRES,
)
from app.simulateur_seed import simulation_econhome


@pytest.fixture(scope="module")
def res():
    return calculer(simulation_econhome(), aujourd_hui=date(2026, 10, 14))


def test_programme_identique_au_modele(res):
    pp = res["programme"]["par_produit"]
    assert (pp["PLAI"]["nb"], pp["PLAI"]["shab"]) == (3, 155)
    assert (pp["PLUS"]["nb"], pp["PLUS"]["shab"]) == (6, 283)
    assert (pp["PLS"]["nb"], pp["PLS"]["shab"]) == (5, 221)
    assert res["programme"]["total"]["nb_locatif"] == 14


def test_surface_annexe_vide_ne_donne_pas_4_m2(res):
    # Le modèle Excel ajoutait 4 m² de SU à chaque logement sans annexe (MIN() ignore les cellules vides).
    pp = res["programme"]["par_produit"]
    assert pp["PLAI"]["su"] == pytest.approx(155)
    assert pp["PLAI"]["loyer_annuel"] == pytest.approx(155 * 6.57 * 12)


def test_surface_utile_avec_annexe():
    d = simulation_defaut()
    d["programme"]["PLUS"][1] = {"typologie": "T2", "nb": 2, "shab": 45, "annexe": 20}
    r = calculer(d)
    ligne = r["programme"]["par_produit"]["PLUS"]["lignes"][1]
    assert ligne["annexe_retenue"] == pytest.approx(4)  # min(20, 8) × 0,5
    assert ligne["su_moy"] == pytest.approx(49)


def test_prix_revient_locatif_identique_au_bilan_operation(res):
    ttc = res["prix_revient"]["ttc"]
    assert ttc["PLAI"] == pytest.approx(636233.84, abs=0.05)
    assert ttc["PLUS"] == pytest.approx(1211188.47, abs=0.05)
    assert ttc["PLS"] == pytest.approx(945839.76, abs=0.05)


def test_prix_revient_brs_additionne_toutes_les_rubriques(res):
    # Le modèle affichait 564 843 € (travaux et honoraires oubliés).
    assert res["prix_revient"]["ht"]["BRS"] == pytest.approx(3845995)
    assert res["prix_revient"]["par_rubrique"]["TRAVAUX BÂTIMENT"]["BRS"] == pytest.approx(2801991)
    assert res["prix_revient"]["par_rubrique"]["HONORAIRES BÂTIMENT"]["BRS"] == pytest.approx(479161)


def test_emprunt_equilibre(res):
    e = res["financement"]["emprunt_equilibre"]
    # PLAI et PLUS : foncier CDC + prêt principal du modèle
    assert e["PLAI"] == pytest.approx(122214.28 + 102713.04, abs=0.05)
    assert e["PLUS"] == pytest.approx(223139.62 + 306183.64, abs=0.05)
    # PLS : le modèle sur-finançait de 10 000 € (prêt principal saisi en dur)
    assert e["PLS"] == pytest.approx(174253.91 + 373124.37 - 10000, abs=0.05)
    # Quotité foncière = 90 % de la charge foncière HT (règle du modèle ECON'HOME)
    assert res["financement"]["quotite_fonciere"]["PLAI"] == pytest.approx(122214.28, abs=0.05)


def test_controle_equilibre_reel(res):
    for p, v in res["financement"]["controle"].items():
        assert abs(v) < 0.01, p
    assert res["financement"]["total_ressources"]["total"] == pytest.approx(res["prix_revient"]["ttc"]["total"])


def test_cession_brs(res):
    c = res["financement"]["cession_brs"]
    assert c["produit_ht"] == pytest.approx(3200 * 1265.28)
    assert c["affectee"] == pytest.approx(3845995 - 136082)  # coût du bâti (TVA BRS 0 %)
    assert res["financement"]["emprunt_equilibre"]["BRS"] == pytest.approx(136082 - 16000)


def test_surfinancement_detecte():
    d = simulation_econhome()
    d["financement"]["montants"]["fonds_propres"]["PLS"] = 900000.0
    r = calculer(d)
    assert r["financement"]["excedent"]["PLS"] > 0
    assert any("sur-financement" in a["message"] for a in r["alertes"])


def test_annuite():
    assert annuite(100000, 0, 20) == pytest.approx(5000)
    assert annuite(100000, 0.03, 40) == pytest.approx(4326.24, abs=0.01)


def test_exploitation_50_ans(res):
    e = res["exploitation"]
    assert len(e["lignes"]) == 50
    a1 = e["lignes"][0]
    assert a1["annee_civile"] == 2029
    # coef d'indexation : barème 2026 → livraison 2029
    assert a1["coef_indexation"] == pytest.approx(1.02 ** 3)
    assert a1["tfpb"] == 0  # exonération 25 ans
    assert e["lignes"][25]["tfpb"] < 0
    assert e["kpis"]["dscr_a1"] is not None
    assert len(e["brs"]) == 50  # compte OFS séparé


def test_exploitation_avec_brs_consolide_locatif_et_compte_ofs(res):
    sans, avec = res["exploitation"], res["exploitation_avec_brs"]
    assert sans["perimetre"] == "sans_brs" and avec["perimetre"] == "avec_brs"
    assert sans["lignes"][0]["redevances_brs"] == 0
    ofs_a1 = sans["brs"][0]["solde"]
    # année 1 : autofinancement consolidé = locatif + solde du compte OFS
    assert avec["kpis"]["autofinancement_net_a1"] == pytest.approx(sans["kpis"]["autofinancement_net_a1"] + ofs_a1)
    assert avec["kpis"]["nb_logements"] == 30 and sans["kpis"]["nb_logements"] == 14


def test_synthese_avec_et_sans_brs(res):
    avec, sans = res["synthese"], res["synthese_sans_brs"]
    assert avec["a_des_brs"] and avec["nb_logements"] == 30 and sans["nb_logements"] == 14
    assert {r["produit"] for r in sans["repartition"]} == {"PLAI", "PLUS", "PLS", "PLI"}
    assert sans["prix_revient_ttc"] == pytest.approx(res["prix_revient"]["ttc"]["total"] - res["prix_revient"]["ttc"]["BRS"])
    assert sans["brs"]["solde_ofs_a1"] is None and sans["cession_affectee"] == 0
    assert sum(x["part"] for x in sans["structure"]) == pytest.approx(1.0)
    assert sans["autofinancement_net_a1"] == pytest.approx(res["exploitation"]["kpis"]["autofinancement_net_a1"])
    assert avec["autofinancement_net_a1"] == pytest.approx(res["exploitation_avec_brs"]["kpis"]["autofinancement_net_a1"])


def test_synthese_lignes_non_interverties(res):
    rep = {r["produit"]: r for r in res["synthese"]["repartition"]}
    assert rep["PLAI"]["nb"] == 3 and rep["PLUS"]["nb"] == 6 and rep["PLS"]["nb"] == 5
    assert rep["PLUS"]["loyer_m2"] == 7.40
    # Total emprunts = tous les prêts, pas seulement le prêt principal
    assert res["synthese"]["emprunts_total"] == pytest.approx(
        res["financement"]["emprunt_equilibre"]["total"] + 500000)


def test_reservations_quotas(res):
    r = res["reservations"]
    assert r["nb_lignes"] == 3
    assert r["nb_logements_programme"] == 30


def test_limites_valider():
    d = normaliser(simulation_defaut())
    for i in range(MAX_LIGNES_SUPPLEMENTAIRES + 1):
        d["prix_revient"]["lignes"].append({"id": f"c{i}", "rubrique": "FONCIER", "libelle": "x",
                                             "montants": {}, "custom": True})
    d = normaliser(d)
    assert valider(d)


def test_appliquer_bareme():
    d = appliquer_bareme(simulation_defaut(zone_123="Z2", zone_abc="B1"), None)
    h = d["hypotheses"]
    assert h["loyer_plafond"]["PLUS"] == 6.49
    assert h["loyer_plafond"]["PLS"] == 10.17
    assert h["prets"]["PLUS"]["taux"] == pytest.approx(0.023)
    assert h["prets"]["PLAI"]["taux"] == pytest.approx(0.015)


def test_prefill_prix_revient():
    d = simulation_defaut()
    d["programme"]["PLUS"][1] = {"typologie": "T2", "nb": 10, "shab": 50, "annexe": 0}
    d = prix_revient_depuis_hypotheses(d)
    lignes = {l["id"]: l for l in d["prix_revient"]["lignes"]}
    assert lignes["trv_tce"]["montants"]["PLUS"] == pytest.approx(500 * 2600)
    assert lignes["fon_acquisition"]["montants"]["PLUS"] == pytest.approx(500 * 876.09)


def test_operation_vide_ne_plante_pas():
    r = calculer(None)
    assert r["synthese"]["nb_logements"] == 0
    assert r["exploitation"]["kpis"]["annee_equilibre"] is None or isinstance(r["exploitation"]["kpis"]["annee_equilibre"], int)
