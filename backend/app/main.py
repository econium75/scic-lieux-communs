from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import (
    operations,
    scenarios,
    menages,
    referentiels,
    calculs,
    exports,
    audit,
    auth as auth_router,
    rgpd,
    users,
    phases,
    agenda,
    notifications,
    briefing,
    attachments,
    imports,
    simulations,
    documents,
    taches,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    from .seed import seed_if_empty
    seed_if_empty()
    simulations.seed_simulations()
    # Seed users
    from .db import engine
    from sqlmodel import Session
    from .auth import seed_default_users
    with Session(engine) as session:
        seed_default_users(session)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=(
        "API du simulateur SCIC Lieux Communs. "
        "Trois moteurs métier : bilan d'opération (M2), "
        "exploitation locative (M3), commercialisation BRS (M4)."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth", tags=["Auth"])
app.include_router(referentiels.router, prefix="/api/referentiels", tags=["M1 Référentiels"])
app.include_router(operations.router, prefix="/api/operations", tags=["Opérations"])
app.include_router(calculs.router, prefix="/api/calculs", tags=["Moteurs M2/M3/M4"])
app.include_router(menages.router, prefix="/api/menages", tags=["M4 Ménages"])
app.include_router(scenarios.router, prefix="/api/scenarios", tags=["M5 Scénarios"])
app.include_router(exports.router, prefix="/api/exports", tags=["M6 Exports"])
app.include_router(audit.router, prefix="/api/audit", tags=["M7 Audit"])
app.include_router(rgpd.router, prefix="/api/rgpd", tags=["RGPD"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(phases.router, prefix="/api/phases", tags=["Phases"])
app.include_router(agenda.router, prefix="/api/agenda", tags=["Agenda"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(briefing.router, prefix="/api/briefing", tags=["Briefing podcast"])
app.include_router(attachments.router, prefix="/api/attachments", tags=["Pièces jointes"])
app.include_router(imports.router, prefix="/api/imports", tags=["Imports batch"])
app.include_router(simulations.router, prefix="/api/simulations", tags=["Simulateur 8 onglets"])
app.include_router(documents.router, prefix="/api/documents", tags=["Porte-documents"])
app.include_router(taches.router, prefix="/api/taches", tags=["Tâches"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": settings.version}
