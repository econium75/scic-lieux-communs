FROM python:3.12-slim

WORKDIR /app

# Deps système minimales (postgres optionnel, bcrypt, reportlab fonts)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Dossier persistant pour SQLite (Railway Volumes à monter sur /data)
RUN mkdir -p /data
ENV SCIC_DATABASE_URL="sqlite:////data/scic.db"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

# Railway injecte PORT dynamiquement ; fallback 8000 pour Docker local
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"
