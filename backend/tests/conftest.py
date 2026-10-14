import os
import tempfile

# Base SQLite jetable pour les tests d'API (doit être défini avant l'import de app.config)
_tmp = tempfile.mkdtemp(prefix="scic_test_")
os.environ.setdefault("SCIC_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("SCIC_DATA_DIR", _tmp)
