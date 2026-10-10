"""Seed Orly Ecohome — valeurs réelles extraites du Modèle de bilan.xls.

30 logements : 16 BRS en accession sociale (SHAB 1265 m², SDP 1361 m²)
+ 14 PLI/Béguinage locatif (SHAB 659 m², SDP 724 m², communs 120 m²).

Chiffres pris en 1-pour-1 depuis le RECAP du fichier (audit 2026-10-09).
"""
from sqlmodel import Session, select
from .db import engine
from .models import Operation, Scenario


# ---------------------------------------------------------------------------
# Hypothèses Orly Ecohome — bilan opération (M2)
# ---------------------------------------------------------------------------

ORLY_LIGNES = [
    # FONCIER
    ("FONCIER", "Acquisition foncier", 14_000, 541_759, "724 €/m² SDP sur PLI"),
    ("FONCIER", "Préparation terrain", 26_500, 14_111, "sondages, géomètre, démolitions, dépollution"),
    ("FONCIER", "Taxes urbanisme (amén., foncière)", 63_542, 36_028, "35 €/m² SDP taxe aménagement"),
    ("FONCIER", "VRD", 32_040, 26_939, "égout 400, eau 300, gaz 600, élec 500, télécom 350 par lgt"),

    # TRAVAUX BÂTIMENT
    ("TRAVAUX BÂTIMENT", "Entreprise générale TCE", 2_720_380, 1_416_850, "2150 €/m² SDP"),
    ("TRAVAUX BÂTIMENT", "Salle commune", 0, 210_000, "1750 €/m² sur 120 m² béguinage"),
    ("TRAVAUX BÂTIMENT", "Aléas travaux (3 %)", 81_611, 48_806, "3 % des travaux"),

    # HONORAIRES BÂTIMENT
    ("HONORAIRES BÂTIMENT", "Maîtrise d'œuvre (9 %)", 313_823, 187_673, "9 % des travaux"),
    ("HONORAIRES BÂTIMENT", "Organisation pilotage coord. (2,2 %)", 61_644, 36_864, "2,2 % des travaux"),
    ("HONORAIRES BÂTIMENT", "Bureau de contrôle (0,45 %)", 12_609, 7_540, "0,45 % des travaux"),
    ("HONORAIRES BÂTIMENT", "Coord. sécurité SPS (0,4 %)", 11_208, 6_703, "0,4 % des travaux"),
    ("HONORAIRES BÂTIMENT", "Labels", 18_400, 16_100, "1150 €/lgt"),
    ("HONORAIRES BÂTIMENT", "AMO faisabilité (0,5 %)", 14_010, 8_378, "0,5 % du total foncier+travaux"),
    ("HONORAIRES BÂTIMENT", "Calculs DPE", 3_200, 2_800, "200 €/lgt"),
    ("HONORAIRES BÂTIMENT", "Assurance DO-TRC+CNR (1,3 %)", 44_267, 26_566, "1,3 % des travaux"),

    # COMMERCIALISATION
    ("COMMERCIALISATION", "Publicité (0,2 %)", 8_098, 5_008, "0,2 % du prix de vente"),
    ("COMMERCIALISATION", "Honoraires commerciaux internes (0,3 %)", 12_147, 7_513, "0,3 % du prix de vente"),

    # GESTION ET MOD
    ("GESTION ET MOD", "OFS (BRS uniquement)", 45_000, 0, "forfait OFS 45 k€ BRS"),
    ("GESTION ET MOD", "Règlement copro & frais d'acte", 9_000, 7_875, ""),
    ("GESTION ET MOD", "Maquette", 5_000, 4_375, ""),
    ("GESTION ET MOD", "SAV", 16_000, 14_000, "1000 €/lgt"),
    ("GESTION ET MOD", "Frais divers", 9_000, 7_875, ""),
    ("GESTION ET MOD", "RMO honoraires gestion interne (5 %)", 202_447, 125_210, "5 % du prix de vente"),
    ("GESTION ET MOD", "RMO honoraires gestion externe (2,5 %)", 101_223, 62_605, "2,5 % du prix de vente"),

    # FRAIS FINANCIERS
    ("FRAIS FINANCIERS", "Garantie de revente (BRS)", 3_840, 0, "240 €/lgt BRS"),
    ("FRAIS FINANCIERS", "Frais financiers externes (0,42 %)", 17_006, 10_518, "0,42 % du total opération"),
]

ORLY_HYPOTHESES = {
    "lignes": [
        {"rubrique": r, "poste": p, "brs": b, "pli": pl, "ratio_commentaire": rc}
        for r, p, b, pl, rc in ORLY_LIGNES
    ],
    "ventes": [
        {"volet": "BRS", "prix_vente_ht": 4_048_937, "nb_logements": 16, "shab_m2": 1265.29, "sdp_m2": 1360.53},
        {"volet": "PLI", "prix_vente_ht": 2_504_200, "nb_logements": 14, "shab_m2": 659.00, "sdp_m2": 724.47},
    ],
    "subventions": [
        {"volet": "BRS", "source": "Action Logement", "montant": 160_000},
        {"volet": "PLI", "source": "AGIRC/ARRCO/CNAV espaces communs béguinage", "montant": 800_000},
    ],

    # M3 — Exploitation locative PLS/PLI (partie béguinage uniquement)
    # Calé sur Simul PLS.xls, adapté au périmètre PLI/Béguinage d'Orly Ecohome
    "exploitation": {
        "zone": "1bis",
        "annee_mise_en_service": 2027,
        "duree_projection_ans": 40,
        "nb_logements": 14,
        "shab_m2": 659.0,
        "su_m2": 724.47,
        # 14 lgts × loyer moyen 540 €/mois = 90 720 €/an (zone 1bis PLS ≈ 11,8 €/m²/mois × 659 = 92 k€)
        "loyer_annuel_initial": 90_720.0,
        "taux_impayes_pct": 3.0,
        "taux_evolution_loyers_pct": 2.0,
        "recettes_annexes_annuel": 2_400.0,  # stationnements
        "frais_gestion_par_logement": 1000.0,
        "taux_evolution_charges_pct": 3.0,
        "tfpb_par_logement": 1250.0,
        "duree_exoneration_tfpb_ans": 25,
        "tadb_par_logement": 0.0,
        # Prêts type CDC — financement opération PLI/Béguinage 2,8 M€
        "prix_de_revient": 2_832_096.0,
        "fonds_propres": 572_096.0,
        "prets": [
            {"nom": "Prêt PLS CDC 40 ans", "montant": 1_460_000, "taux_pct": 3.80, "duree_ans": 40, "differe_ans": 0},
            {"nom": "Prêt PLAI complémentaire", "montant": 500_000, "taux_pct": 1.20, "duree_ans": 40, "differe_ans": 0},
            {"nom": "Prêt Action Logement 1%", "montant": 300_000, "taux_pct": 0.50, "duree_ans": 25, "differe_ans": 0},
        ],
        # Composants (ratios Simul PLS adaptés à 2,03 M€ base amortissable)
        "composants": [
            {"nom": "Structure", "valeur": 1_300_000, "duree_amort_ans": 50},
            {"nom": "Couverture", "valeur": 90_000, "duree_amort_ans": 30},
            {"nom": "Étanchéité", "valeur": 90_000, "duree_amort_ans": 18},
            {"nom": "Ravalement", "valeur": 40_000, "duree_amort_ans": 15},
            {"nom": "Menuiseries ext. et int.", "valeur": 60_000, "duree_amort_ans": 30},
            {"nom": "Plomberie / sanitaires", "valeur": 85_000, "duree_amort_ans": 25},
            {"nom": "Ascenseur", "valeur": 50_000, "duree_amort_ans": 18},
            {"nom": "Courants faibles", "valeur": 95_000, "duree_amort_ans": 30},
            {"nom": "Chauffage", "valeur": 55_000, "duree_amort_ans": 20},
        ],
        "taux_actualisation_pct": 3.0,
    },
}


# ---------------------------------------------------------------------------
# Ménages d'exemple pour M4 (extraits illustratifs — à remplacer par Econ'Home)
# ---------------------------------------------------------------------------

ORLY_MENAGES_DEMO = [
    {
        "reference": "M-001", "typologie_logement": "T3", "zone": "Saint-Denis",
        "composition": {"adultes": 2, "enfants_moins_14": 1, "enfants_14_plus": 0},
        "revenu_activites_annuel": 36_000,
        "prestations_sociales_annuel": 4_800,
        "revenus_patrimoine_annuel": 0,
        "apport": 25_000,
    },
    {
        "reference": "M-002", "typologie_logement": "T2", "zone": "Saint-Denis",
        "composition": {"adultes": 1, "enfants_moins_14": 0, "enfants_14_plus": 0},
        "revenu_activites_annuel": 24_000,
        "prestations_sociales_annuel": 1_800,
        "revenus_patrimoine_annuel": 0,
        "apport": 10_000,
    },
    {
        "reference": "M-003", "typologie_logement": "T4", "zone": "Saint-Denis",
        "composition": {"adultes": 2, "enfants_moins_14": 2, "enfants_14_plus": 1},
        "revenu_activites_annuel": 48_000,
        "prestations_sociales_annuel": 7_200,
        "revenus_patrimoine_annuel": 0,
        "apport": 15_000,
    },
    {
        "reference": "M-004", "typologie_logement": "T3", "zone": "Saint-Denis",
        "composition": {"adultes": 2, "enfants_moins_14": 0, "enfants_14_plus": 2},
        "revenu_activites_annuel": 54_000,
        "prestations_sociales_annuel": 2_400,
        "revenus_patrimoine_annuel": 0,
        "apport": 40_000,
    },
    {
        "reference": "M-005", "typologie_logement": "T2", "zone": "Saint-Denis",
        "composition": {"adultes": 1, "enfants_moins_14": 1, "enfants_14_plus": 0},
        "revenu_activites_annuel": 19_500,
        "prestations_sociales_annuel": 5_400,
        "revenus_patrimoine_annuel": 0,
        "apport": 5_000,
    },
]


def seed_if_empty() -> None:
    with Session(engine) as session:
        existing = session.exec(select(Operation)).first()
        if existing:
            return

        op = Operation(
            code="ORLY-ECO-2027",
            nom="Orly Ecohome",
            commune="Orly (94)",
            zone_brs="1bis",
            nb_logements_total=30,
            nb_logements_brs=16,
            nb_logements_pls=0,
            nb_logements_pli=12,
            nb_logements_pluspai=0,
            surface_habitable_m2=1924.29,
            livraison_cible="T4 2027",
        )
        session.add(op)
        session.commit()
        session.refresh(op)

        scenario = Scenario(
            operation_id=op.id,
            nom="Scénario de référence",
            is_reference=True,
            hypotheses=ORLY_HYPOTHESES,
        )
        session.add(scenario)
        session.commit()
        session.refresh(scenario)

        from .models import Menage
        for m in ORLY_MENAGES_DEMO:
            menage = Menage(
                scenario_id=scenario.id,
                reference=m["reference"],
                typologie_logement=m["typologie_logement"],
                nb_personnes=(
                    m["composition"]["adultes"]
                    + m["composition"]["enfants_moins_14"]
                    + m["composition"]["enfants_14_plus"]
                ),
                nb_enfants=m["composition"]["enfants_moins_14"] + m["composition"]["enfants_14_plus"],
                revenu_fiscal_annuel=(
                    m["revenu_activites_annuel"] + m["revenus_patrimoine_annuel"]
                ),
                apport=m["apport"],
                prestations_sociales_mensuelles=m["prestations_sociales_annuel"] / 12,
            )
            session.add(menage)
        session.commit()
