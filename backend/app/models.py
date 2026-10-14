"""Modèles de données SQLModel pour SCIC Lieux Communs."""
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship, JSON, Column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Operation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True)
    nom: str
    commune: str
    zone_brs: str = Field(default="1bis")
    nb_logements_total: int
    nb_logements_brs: int
    nb_logements_pls: int = 0
    nb_logements_pli: int = 0
    nb_logements_pluspai: int = 0
    surface_habitable_m2: float
    livraison_cible: str = Field(default="T4 2027")
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    scenarios: list["Scenario"] = Relationship(back_populates="operation")


class Scenario(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    operation_id: int = Field(foreign_key="operation.id", index=True)
    nom: str = Field(default="Scénario de référence")
    is_reference: bool = Field(default=False)
    hypotheses: dict = Field(default_factory=dict, sa_column=Column(JSON))
    bilan_result: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    exploitation_result: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    operation: Optional[Operation] = Relationship(back_populates="scenarios")


class Simulation(SQLModel, table=True):
    """Simulateur 8 onglets — une simulation par opération (saisie JSON, calculs à la volée)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    operation_id: int = Field(foreign_key="operation.id", index=True, unique=True)
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=_utcnow)
    updated_by: str = Field(default="")


class Menage(SQLModel, table=True):
    """Ménage candidat à l'accession BRS (M4)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    scenario_id: int = Field(foreign_key="scenario.id", index=True)
    reference: str
    typologie_logement: str = Field(default="T3")

    # Composition
    nb_personnes: int = 1
    nb_enfants: int = 0  # legacy, voir composition_json pour détail

    # Finances
    revenu_fiscal_annuel: float = 0.0
    apport: float = 0.0
    prestations_sociales_mensuelles: float = 0.0

    # Résultat M4 (JSON lourd)
    qualification: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=_utcnow)


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    at: datetime = Field(default_factory=_utcnow, index=True)
    user: str = Field(default="system")
    action: str
    target_type: str
    target_id: Optional[int] = None
    payload: Optional[dict] = Field(default=None, sa_column=Column(JSON))


class Referentiel(SQLModel, table=True):
    """M1 — Table clé/valeur des référentiels éditables."""
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    label: str
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=_utcnow)


class User(SQLModel, table=True):
    """Auth multi-utilisateur — 3 rôles conformément à la note V2 (§Q3)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: str = Field(default="")
    password_hash: str
    role: str = Field(default="lecture")  # admin | saisie | lecture
    nom_affichage: str = Field(default="")
    actif: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)


class Phase(SQLModel, table=True):
    """Suivi de projet — chaque opération a une séquence de phases avec jalons."""
    id: Optional[int] = Field(default=None, primary_key=True)
    operation_id: int = Field(foreign_key="operation.id", index=True)
    ordre: int = Field(default=0)
    nom: str  # "Incubation", "Cadrage", "Montage financier", "Instruction permis", "VEFA", "Livraison", "Exploitation"
    statut: str = Field(default="a_faire")  # a_faire | en_cours | termine | bloque
    date_cible: Optional[datetime] = None
    date_realisation: Optional[datetime] = None
    responsable: str = Field(default="")  # username
    notes: str = Field(default="")
    livrables: dict = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=_utcnow)


class EventAgenda(SQLModel, table=True):
    """Événement calendrier partagé — COPIL, COPROJ, deadlines, rdv financeurs."""
    id: Optional[int] = Field(default=None, primary_key=True)
    titre: str
    description: str = Field(default="")
    debut: datetime
    fin: Optional[datetime] = None
    toute_journee: bool = Field(default=False)
    type_event: str = Field(default="rdv")  # copil | coproj | jalon | rdv | deadline | autre
    operation_id: Optional[int] = Field(default=None, foreign_key="operation.id", index=True)
    phase_id: Optional[int] = Field(default=None, foreign_key="phase.id")
    organisateur: str = Field(default="")  # username
    participants: list = Field(default_factory=list, sa_column=Column(JSON))  # [usernames]
    lieu: str = Field(default="")
    created_at: datetime = Field(default_factory=_utcnow)


class Notification(SQLModel, table=True):
    """Notification in-app par utilisateur."""
    id: Optional[int] = Field(default=None, primary_key=True)
    destinataire: str = Field(index=True)  # username
    type_notif: str  # mention | validation | consultation | deadline | audit | info
    titre: str
    message: str = Field(default="")
    lue: bool = Field(default=False, index=True)
    url_action: Optional[str] = None  # ex: "/operations/1/scenarios/compare?a=1&b=2"
    emise_par: str = Field(default="system")
    at: datetime = Field(default_factory=_utcnow, index=True)
    target_type: Optional[str] = None
    target_id: Optional[int] = None


class Attachment(SQLModel, table=True):
    """Pièce jointe liée à un objet (operation/phase/event/scenario)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    parent_type: str = Field(index=True)  # operation | phase | event | scenario
    parent_id: int = Field(index=True)
    filename: str
    mimetype: str = Field(default="application/octet-stream")
    size: int = Field(default=0)
    description: str = Field(default="")
    stored_path: str  # chemin relatif sous data/attachments/
    uploaded_by: str = Field(default="")
    uploaded_at: datetime = Field(default_factory=_utcnow, index=True)


class Document(SQLModel, table=True):
    """Porte-documents : un document appartient à un utilisateur et peut être partagé."""
    id: Optional[int] = Field(default=None, primary_key=True)
    titre: str
    nom_fichier: str
    mimetype: str = Field(default="application/pdf")
    proprietaire: str = Field(index=True)  # username
    dossier: str = Field(default="Général")
    description: str = Field(default="")
    operation_id: Optional[int] = Field(default=None, foreign_key="operation.id", index=True)
    partage_avec: list = Field(default_factory=list, sa_column=Column(JSON))  # [usernames]
    version_courante: int = Field(default=1)
    statut: str = Field(default="brouillon")  # brouillon | signe
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class DocumentVersion(SQLModel, table=True):
    """Chaque modification (annotation, signature, nouvel import) crée une version ; rien n'est écrasé."""
    id: Optional[int] = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="document.id", index=True)
    numero: int
    chemin: str  # relatif à data/documents/
    taille: int = 0
    sha256: str = ""
    nb_pages: int = 0
    auteur: str = ""
    commentaire: str = ""
    created_at: datetime = Field(default_factory=_utcnow)


class SignatureDocument(SQLModel, table=True):
    """Journal de signature (preuve : qui, quand, empreinte du fichier signé)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="document.id", index=True)
    version_numero: int
    signataire: str = Field(index=True)
    nom_affichage: str = ""
    signed_at: datetime = Field(default_factory=_utcnow)
    sha256: str = ""
    ip: str = ""
    pages: list = Field(default_factory=list, sa_column=Column(JSON))
    tache_id: Optional[int] = None


class SignatureUtilisateur(SQLModel, table=True):
    """Signature manuscrite enregistrée par l'utilisateur (image PNG en data URL)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    image: str  # data:image/png;base64,...
    paraphe: str = Field(default="")
    updated_at: datetime = Field(default_factory=_utcnow)


class Tache(SQLModel, table=True):
    """Tâche envoyée à un utilisateur : validation, consultation, signature ou autre."""
    id: Optional[int] = Field(default=None, primary_key=True)
    type_tache: str = Field(default="validation")  # validation | consultation | signature | autre
    titre: str
    description: str = Field(default="")
    emetteur: str = Field(index=True)
    destinataire: str = Field(index=True)
    groupe: str = Field(default="", index=True)  # même envoi à plusieurs destinataires
    statut: str = Field(default="a_faire", index=True)  # a_faire | terminee | refusee | annulee
    priorite: str = Field(default="normale")  # normale | haute | urgente
    echeance: Optional[datetime] = None
    operation_id: Optional[int] = Field(default=None, foreign_key="operation.id")
    document_id: Optional[int] = Field(default=None, foreign_key="document.id")
    reponse: str = Field(default="")  # validee | refusee | consultee | signee | faite
    commentaire_reponse: str = Field(default="")
    vue_at: Optional[datetime] = None
    terminee_at: Optional[datetime] = None
    rappel_retard_envoye: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class Briefing(SQLModel, table=True):
    """Briefing quotidien personnalisé (texte + lien audio)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    destinataire: str = Field(index=True)  # username
    jour: str = Field(index=True)  # YYYY-MM-DD
    titre: str
    script_texte: str
    audio_path: Optional[str] = None  # chemin relatif sous data/briefings/
    duree_estimee_sec: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utcnow)
    lu: bool = Field(default=False)
