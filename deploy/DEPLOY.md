# Déploiement souverain SCIC Lieux Communs

Guide de déploiement en production sur VPS souverain français
(Scaleway, OVH, Clever Cloud — conforme RGPD).

## Prérequis

- VPS Linux (Debian 12 ou Ubuntu 22.04 recommandé) · 2 vCPU · 4 GB RAM · 20 GB SSD
- Nom de domaine pointé vers l'IP (ex : `simulateur.scic-lieuxcommuns.fr`)
- Docker + docker-compose installés
- Ports 80/443 ouverts

## Choix d'hébergeur (recommandation note V2 §5.3)

| Hébergeur | Datacenter | Prix indicatif | Points forts |
|---|---|---|---|
| **Scaleway** | Paris / Amsterdam | ~15 €/mois (DEV1-M) | Souverain FR, API complète, snapshots |
| **OVH** | Roubaix / Gravelines | ~10 €/mois (VPS Value) | Historique France, offres éco |
| **Clever Cloud** | Paris | ~25 €/mois | PaaS managé (pas d'ops), déploiement git push |

Recommandation : **Scaleway DEV1-M + nom de domaine .fr via Gandi**.

## Installation

```bash
# 1. Cloner le repo sur le serveur
git clone <url-repo> /opt/scic-lieux-communs
cd /opt/scic-lieux-communs

# 2. Générer une clé secrète JWT
openssl rand -hex 32 > .secret_key
echo "SCIC_SECRET_KEY=$(cat .secret_key)" >> .env
echo "PUBLIC_DOMAIN=simulateur.scic-lieuxcommuns.fr" >> .env
echo "ADMIN_EMAIL=admin@scic-lieuxcommuns.fr" >> .env

# 3. Décommenter la section caddy dans docker-compose.yml

# 4. Build & démarrage
docker compose up -d --build

# 5. Changer les mots de passe par défaut (admin, saisie, lecture)
docker compose exec backend python -c "
from app.db import engine
from sqlmodel import Session, select
from app.models import User
from app.auth import hash_password
with Session(engine) as s:
    for u in s.exec(select(User)).all():
        print(f'Changer mot de passe pour {u.username}:')
        import getpass
        pwd = getpass.getpass()
        u.password_hash = hash_password(pwd)
        s.add(u)
    s.commit()
"
```

## Vérification

```bash
# Backend
curl -f https://simulateur.scic-lieuxcommuns.fr/api/health

# Login
curl -X POST https://simulateur.scic-lieuxcommuns.fr/api/auth/login \
    -d "username=admin&password=<nouveau-mdp>"
```

## Backup automatique SQLite

Ajouter à `/etc/cron.daily/scic-backup` :

```bash
#!/bin/bash
BACKUP_DIR=/var/backups/scic
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d-%H%M%S)
docker compose -f /opt/scic-lieux-communs/docker-compose.yml \
    exec -T backend sqlite3 /data/scic.db ".backup /tmp/scic-$DATE.db"
docker cp scic-backend:/tmp/scic-$DATE.db $BACKUP_DIR/
# Chiffrage GPG optionnel
# gpg --encrypt -r admin@scic-lieuxcommuns.fr $BACKUP_DIR/scic-$DATE.db
# Rétention 30 jours
find $BACKUP_DIR -name "scic-*.db" -mtime +30 -delete
```

```bash
chmod +x /etc/cron.daily/scic-backup
```

## Conformité RGPD

Avant mise en production, finaliser :

- [ ] **DPIA** (Analyse d'Impact relative à la Protection des Données) — modèle CNIL
- [ ] **Désignation DPO** (interne ou externalisé)
- [ ] **Registre des traitements** accessible via `/api/rgpd/registre` à documenter
- [ ] **Mention légale** et **politique de confidentialité** sur l'interface
- [ ] **Consentement** explicite des ménages avant saisie
- [ ] **Procédure d'effacement** sur demande (`DELETE /api/menages/{id}`)
- [ ] **Chiffrement des backups** (GPG recommandé)
- [ ] **Journal d'audit** archivé 3 ans minimum
- [ ] **Changement des mots de passe par défaut** obligatoire

## Migration vers PostgreSQL (optionnelle, V2)

Si le volume l'exige (> 20 utilisateurs simultanés) :

1. Ajouter un service `postgres` dans `docker-compose.yml`
2. Changer `SCIC_DATABASE_URL=postgresql://scic:xxx@postgres:5432/scic`
3. Migrer les données avec `pgloader` ou export/import SQL

## Monitoring (optionnel)

- Logs applicatifs : `docker compose logs -f`
- Logs d'accès Caddy : `/data/access.log` (format JSON)
- Métriques Prometheus/Grafana : ajouter un endpoint `/metrics` au backend
- Alertes : UptimeRobot / BetterUptime (gratuit jusqu'à 10 moniteurs)
