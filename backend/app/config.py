from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Téo — SCIC Faire Commun"
    version: str = "0.1.0"
    database_url: str = "sqlite:///./scic.db"
    data_dir: Path = Path(__file__).parent / "data"
    cors_origins: list[str] = ["http://localhost:3000"]
    secret_key: str = "change-me-in-production-use-env-var"

    class Config:
        env_prefix = "SCIC_"


settings = Settings()
