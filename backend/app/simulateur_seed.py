"""Jeu de données ECON'HOME — Orly, repris des modèles Excel du client (octobre 2026).

- Programme locatif (14 logements PLAI/PLUS/PLS) : « Calcul des loyers.xlsx ».
- Prix de revient PLAI/PLUS/PLS : « Bilan d'opération.xlsx » (charge foncière, travaux, honoraires, aléas).
- Prix de revient BRS (16 logements) : « Prix de revient détaillé.xlsx », colonne BRS HT.
- Financements : « Bilan d'opération.xlsx » (CNAV, AGIRC-ARCCO, fondations, sociétaires…).
- Hypothèses : « Hypothèses de simulation 2.xlsx » (TVA PLI 10 % validée par le client).
"""
from .engines.simulateur import simulation_defaut, PRODUITS


def _prog(rows: list[tuple[str, int, float]]) -> list[dict]:
    by = {t: (n, s) for t, n, s in rows}
    return [{"typologie": t, "nb": by.get(t, (0, 0.0))[0], "shab": by.get(t, (0, 0.0))[1], "annexe": 0.0}
            for t in ["T1", "T2", "T2 bis", "T3", "T4", "T5"]]


def simulation_econhome() -> dict:
    d = simulation_defaut("ECON'HOME", "Orly", "Z1", "A", 2029)
    h = d["hypotheses"]
    h.update({
        "charge_fonciere_m2": 876.088,
        "travaux_m2": 2600.0,
        "honoraires_pct": 0.121442,
        "aleas_pct": 0.038041,
        "quotite_fonciere_mode": "pct_charge_fonciere",
        "quotite_fonciere_pct": 0.90,
        "prix_vente_brs_m2_su": 3200.0,
    })
    d["programme"]["PLAI"] = _prog([("T2", 1, 45), ("T2 bis", 2, 55)])
    d["programme"]["PLUS"] = _prog([("T1", 1, 38), ("T2", 3, 45), ("T2 bis", 2, 55)])
    d["programme"]["PLS"] = _prog([("T1", 2, 38), ("T2", 2, 45), ("T2 bis", 1, 55)])
    d["programme"]["BRS"] = _prog([("T3", 16, 79.08)])

    montants = {
        # id: {PLAI, PLUS, PLS, PLI, BRS} — HT
        "fon_acquisition": (135793.64, 247932.91, 193615.45, 0, 14000),
        "fon_preparation": (0, 0, 0, 0, 26500),
        "fon_taxes": (0, 0, 0, 0, 63542),
        "fon_vrd": (0, 0, 0, 0, 32040),
        "trv_tce": (403000, 735800, 574600, 0, 2720380),
        "trv_aleas": (15330.43, 27990.40, 21858.23, 0, 81611),
        "hon_moe": (48941.18, 89357.12, 69780.65, 0, 313823),
        "hon_opc": (0, 0, 0, 0, 61644),
        "hon_bct": (0, 0, 0, 0, 12609),
        "hon_sps": (0, 0, 0, 0, 11208),
        "hon_labels": (0, 0, 0, 0, 18400),
        "hon_amo": (0, 0, 0, 0, 14010),
        "hon_dpe": (0, 0, 0, 0, 3200),
        "hon_do": (0, 0, 0, 0, 44267),
        "com_pub": (0, 0, 0, 0, 8098),
        "com_hono": (0, 0, 0, 0, 12147),
        "ges_ofs": (0, 0, 0, 0, 45000),
        "ges_copro": (0, 0, 0, 0, 9000),
        "ges_maquette": (0, 0, 0, 0, 5000),
        "ges_sav": (0, 0, 0, 0, 16000),
        "ges_divers": (0, 0, 0, 0, 9000),
        "ges_rmo_int": (0, 0, 0, 0, 202447),
        "ges_rmo_ext": (0, 0, 0, 0, 101223),
        "fin_garantie": (0, 0, 0, 0, 3840),
        "fin_externes": (0, 0, 0, 0, 17006),
    }
    for l in d["prix_revient"]["lignes"]:
        if l["id"] in montants:
            l["montants"] = dict(zip(PRODUITS, map(float, montants[l["id"]])))

    m = d["financement"]["montants"]
    m["subv_etat"]["BRS"] = 16000.0
    for p in PRODUITS:
        m["subv_collectivites"][p] = 0.0
        m["subv_action_logement"][p] = 0.0
    m["fonds_propres"].update({"PLAI": 0.0, "PLUS": 145865.21, "PLS": 133461.48, "BRS": 0.0})
    m["fonds_propres_societaires"].update({"PLAI": 15000.0, "PLUS": 30000.0, "PLS": 25000.0})
    m["pret_cnav"].update({"PLUS": 350000.0, "PLS": 150000.0})

    def comp(i: str, lib: str, vals: tuple) -> dict:
        return {"id": i, "libelle": lib, "nature": "subvention", "taux": 0.0, "duree": 0,
                "montants": dict(zip(PRODUITS, map(float, vals)))}

    d["financement"]["complementaires"] = [
        comp("fc_cnav", "Subvention CNAV", (100000, 0, 0, 0, 0)),
        comp("fc_agirc", "Subvention AGIRC-ARCCO", (100000, 150000, 100000, 0, 0)),
        comp("fc_pfp", "Subvention Fondation des petits frères des pauvres", (100000, 0, 0, 0, 0)),
        comp("fc_fpl", "Subvention Fondation pour le logement", (60306.53, 0, 0, 0, 0)),
    ]

    d["reservations"] = [
        {"id": "r1", "logement": "A01", "typologie": "T2", "produit": "PLAI",
         "categorie": "État – publics prioritaires", "reservataire": "Préfecture du Val-de-Marne",
         "convention": "Exemple — à remplacer", "date_signature": "", "date_echeance": "",
         "mode": "Flux", "statut": "Réservé", "contact": "", "observations": "Ligne d'exemple"},
        {"id": "r2", "logement": "A04", "typologie": "T2", "produit": "PLUS",
         "categorie": "Action Logement", "reservataire": "Action Logement Services",
         "convention": "Exemple — à remplacer", "date_signature": "", "date_echeance": "",
         "mode": "Flux", "statut": "Réservé", "contact": "", "observations": "Ligne d'exemple"},
        {"id": "r3", "logement": "A09", "typologie": "T1", "produit": "PLS",
         "categorie": "Commune", "reservataire": "Ville d'Orly",
         "convention": "Exemple — à remplacer", "date_signature": "", "date_echeance": "",
         "mode": "Flux", "statut": "Réservé", "contact": "", "observations": "Ligne d'exemple"},
    ]
    return d
