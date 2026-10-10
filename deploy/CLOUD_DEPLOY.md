# Déploiement cloud — accès internet pour les utilisateurs

Trois chemins au choix, du plus simple au plus souverain.

---

## 🚀 Option A — Railway (~5 min, free tier dispo)

**Pourquoi** : zéro config, auto-deploy à chaque git push, URL HTTPS automatique.

```bash
# 1. Push le code sur GitHub (si pas déjà fait)
cd /path/to/scic-lieux-communs
git init && git add . && git commit -m "Initial SCIC Lieux Communs"
gh repo create scic-lieux-communs --private --source=. --push

# 2. Railway CLI
npm i -g @railway/cli
railway login
railway init    # crée un projet lié à ce repo
railway up      # déploie backend + frontend (lit railway.json et chaque Dockerfile)

# 3. Dans la console Railway :
#    - Pour chaque service, "Settings → Generate domain" (donne p.ex. scic-backend-xxx.up.railway.app)
#    - Variables backend : SCIC_SECRET_KEY = $(openssl rand -hex 32)
#    - Variables frontend : NEXT_PUBLIC_API_URL = https://<backend-url>
#    - Monter un volume persistant /data pour le backend (Settings → Volumes)
```

**URL publique obtenue** : `https://scic-frontend-xxx.up.railway.app` — accessible depuis internet.

Coût : gratuit jusqu'à 500 h/mois ; après ~5 $/mois par service.

⚠️ Hébergement en zone Railway (US/EU au choix). Pour RGPD strict, préférer **Scaleway**.

---

## 🇫🇷 Option B — Scaleway Serverless Container (souverain FR, ~10 €/mois)

**Pourquoi** : datacenter Paris / Amsterdam, conformité RGPD, bon rapport qualité-prix.

```bash
# 1. Installer scw CLI et se connecter
curl -L https://github.com/scaleway/scaleway-cli/releases/latest/download/scw-cli-linux-amd64 -o /usr/local/bin/scw
chmod +x /usr/local/bin/scw
scw init

# 2. Build + push les images sur le Container Registry Scaleway
scw registry create namespace-name=scic region=fr-par
docker build -t rg.fr-par.scw.cloud/scic/backend:latest ./backend
docker build -t rg.fr-par.scw.cloud/scic/frontend:latest ./frontend
docker push rg.fr-par.scw.cloud/scic/backend:latest
docker push rg.fr-par.scw.cloud/scic/frontend:latest

# 3. Créer les containers (console web plus simple)
# https://console.scaleway.com/containers/
#   - Backend : image scic/backend, port 8000, memory 1024, env SCIC_SECRET_KEY=...
#   - Frontend : image scic/frontend, port 3000, env NEXT_PUBLIC_API_URL=https://<url-backend>

# 4. Nom de domaine custom via Scaleway DNS
# https://console.scaleway.com/domains/
```

**URL publique** : `https://<nom>.functions.fnc.fr-par.scw.cloud` ou domaine custom.

Coût : ~5 €/mois backend + ~5 €/mois frontend (facture à l'usage).

---

## 🏢 Option C — VPS souverain (OVH / Scaleway, ~10 €/mois, contrôle total)

**Pourquoi** : la plus proche de la recommandation note V2 §5.3, backup/monitoring custom, PostgreSQL possible.

Suivre le guide détaillé dans [DEPLOY.md](DEPLOY.md) — install Docker + compose sur VPS Debian, HTTPS via Caddy + Let's Encrypt.

```bash
# Résumé :
ssh root@<vps-ip>
apt install docker.io docker-compose-plugin
git clone <repo> /opt/scic
cd /opt/scic
cp .env.example .env    # éditer SCIC_SECRET_KEY, PUBLIC_DOMAIN, ADMIN_EMAIL
docker compose up -d --build
# → accessible sur https://<domaine>
```

---

## Comparaison

| Critère | Railway | Scaleway Containers | VPS souverain |
|---|---|---|---|
| Setup | ~5 min | ~15 min | ~1 h |
| Souveraineté FR | Non garantie | ✅ Paris/Amsterdam | ✅ (si Scaleway/OVH) |
| Coût /mois | 0-10 $ | ~10 € | ~10 € |
| Scaling auto | Oui | Oui | Non (manuel) |
| PostgreSQL managé | Oui ($) | Oui ($) | À installer soi-même |
| Idéal pour | MVP, démo | Production RGPD | Contrôle total |

**Recommandation pour la V1 SCIC Lieux Communs** :
- **Démo / test interne** : Railway (option A), déploiement en 5 min
- **Mise en production** : Scaleway Containers (option B), conforme RGPD

---

## Post-déploiement — checklist obligatoire

1. **Changer les 3 mots de passe par défaut** (admin / saisie / lecture)
2. Vérifier que `SCIC_SECRET_KEY` est bien généré aléatoirement (JAMAIS la valeur par défaut)
3. Configurer les CORS dans `SCIC_CORS_ORIGINS` pour n'autoriser que votre domaine frontend
4. Activer HTTPS (automatique sur Railway/Scaleway/Render)
5. Programmer les backups quotidiens de `scic.db` (volume persistant /data)
6. Renseigner le DPO et finaliser le DPIA (cf. `/api/rgpd/registre`)
7. Première connexion : `https://<url-frontend>/login` → admin / admin123
