from contextlib import contextmanager
from sqlmodel import SQLModel, Session, create_engine
from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=False,
)


# Colonnes ajoutées après coup à des tables existantes : create_all ne les crée pas sur une base déjà en place.
COLONNES_AJOUTEES = [
    ("phase", "date_debut", "DATETIME"),
]


def _migrer_colonnes() -> None:
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, colonne, type_sql in COLONNES_AJOUTEES:
            if table in insp.get_table_names() and colonne not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {colonne} {type_sql}"))


def init_db() -> None:
    from . import models  # noqa: F401  register models
    SQLModel.metadata.create_all(engine)
    _migrer_colonnes()


def get_session():
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope():
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
