"""Registre RGPD des traitements — exigence conformité (cf. note V2 §12 risques)."""
from fastapi import APIRouter

router = APIRouter()


REGISTRE = {
    "responsable": "SCIC FAIRE COMMUN",
    "sous_traitant": "Incepta Group Pte. Ltd. (hébergement + maintenance)",
    "dpo_contact": "À désigner avant mise en production",
    "finalite_principale": (
        "Simulation financière multi-scénarios pour opérations immobilières BRS/PLS/PLI, "
        "incluant la qualification de ménages candidats à l'accession sociale."
    ),
    "traitements": [
        {
            "nom": "Qualification ménage M4",
            "donnees_collectees": [
                "Référence pseudonymisée (ex: M-001) — PAS DE NOM NI D'ADRESSE",
                "Composition famille (nombre adultes / enfants <14 / enfants ≥14)",
                "Revenus annuels (activités + patrimoine)",
                "Prestations sociales (CAF annuelle)",
                "Apport personnel",
                "Zone de résidence (commune FiLoSoFi)",
            ],
            "base_legale": "Consentement explicite du ménage (dossier candidature BRS)",
            "duree_conservation": "7 ans après fin de la commercialisation (obligation comptable)",
            "destinataires": [
                "Équipe commerciale SCIC Faire Commun",
                "Expert-comptable (sur demande)",
                "ANRU (sur demande, pour justification des subventions attribuées)",
            ],
            "mesures_securite": [
                "Pseudonymisation par référence (M-NNN) — pas de PII en base",
                "Authentification JWT avec 3 rôles (admin/saisie/lecture)",
                "Journal d'audit horodaté de toutes les actions (M7)",
                "Hébergement souverain France (OVH / Scaleway / Clever Cloud)",
                "Backups quotidiens chiffrés",
                "HTTPS obligatoire (Let's Encrypt)",
            ],
            "transfert_hors_ue": "Aucun",
        },
        {
            "nom": "Audit et journalisation",
            "donnees_collectees": [
                "Nom d'utilisateur de l'opérateur",
                "Horodatage de chaque action",
                "Type d'action (calcul, édition, export)",
                "Cible (scenario ID, menage ID)",
            ],
            "base_legale": "Intérêt légitime (traçabilité comptable et conformité ANRU)",
            "duree_conservation": "3 ans",
            "destinataires": ["Administrateur SCIC"],
            "mesures_securite": ["Accès restreint via rôle admin", "Export CSV réservé admin"],
            "transfert_hors_ue": "Aucun",
        },
        {
            "nom": "Authentification utilisateurs",
            "donnees_collectees": [
                "Nom d'utilisateur (login professionnel)",
                "Mot de passe hashé bcrypt",
                "Rôle (admin / saisie / lecture)",
                "Nom d'affichage",
            ],
            "base_legale": "Exécution du contrat de travail / mandat",
            "duree_conservation": "Durée du contrat + 1 an",
            "destinataires": ["Administrateur SCIC"],
            "mesures_securite": [
                "Mots de passe jamais stockés en clair (bcrypt)",
                "JWT signé, expiration 24h",
                "Logout invalide le token côté client",
            ],
            "transfert_hors_ue": "Aucun",
        },
    ],
    "droits_personnes_concernees": [
        "Droit d'accès à ses données (contact DPO)",
        "Droit de rectification",
        "Droit à l'effacement (sous réserve des obligations légales de conservation)",
        "Droit à la portabilité",
        "Droit d'opposition et de limitation du traitement",
        "Droit de réclamation auprès de la CNIL",
    ],
    "dpia_requise": True,
    "dpia_statut": (
        "DPIA à produire en phase 1 (cf. note V2 §12). "
        "Facteurs déclencheurs : évaluation de solvabilité, traitement à grande échelle, "
        "croisement avec données socio-économiques Insee."
    ),
}


@router.get("/registre")
def get_registre() -> dict:
    """Registre des traitements RGPD (consultable par tout utilisateur authentifié)."""
    return REGISTRE
