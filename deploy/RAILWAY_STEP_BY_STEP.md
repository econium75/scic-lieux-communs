# Déploiement Railway — guide pas à pas (10 min au total)

Tu obtiens une URL HTTPS publique permanente du type `https://scic-xxx.up.railway.app`.
Compte Railway gratuit jusqu'à 500 h/mois.

## Prérequis — vérifier dans ton terminal

```bash
git --version       # doit retourner git version 2.x
gh --version        # doit retourner gh version 2.x
node --version      # doit retourner v20.x ou plus
```

Tu as déjà les 3. Il manque juste le Railway CLI (étape 2).

---

## Étape 1 — Initialiser le repo Git (1 min)

```bash
cd C:/Users/LENOVO/Documents/scic-lieux-communs
git init
git add .
git commit -m "SCIC Lieux Communs v0.8 — initial deploy"
```

## Étape 2 — Créer le repo GitHub (1 min)

Si pas encore connecté à GitHub :
```bash
gh auth login
# Choisir : GitHub.com → HTTPS → Login with web browser
# Copier le code, ouvrir le lien, coller
```

Puis créer et pousser :
```bash
gh repo create scic-lieux-communs --private --source=. --push
```

## Étape 3 — Installer Railway CLI (1 min)

```bash
npm install -g @railway/cli
railway --version
```

## Étape 4 — Login Railway (1 min)

```bash
railway login
# Ça ouvre ton navigateur : crée un compte Railway (gratuit, lié à ton GitHub de préférence)
```

## Étape 5 — Déployer le backend (3 min)

```bash
cd backend
railway init
# Choisir : Create new project → "scic-lieux-communs-backend"

railway up
# Build + deploy automatique (lit backend/Dockerfile)
# Suivre les logs : attendre "Successfully deployed"
```

Dans la console Railway (`railway open` ouvre le navigateur) :

1. **Settings → Networking → Generate Domain** → tu obtiens `scic-backend-xxx.up.railway.app`
2. **Variables** → ajouter :
   - `SCIC_SECRET_KEY` = (généré via `openssl rand -hex 32` ou laisser Railway générer)
   - `SCIC_CORS_ORIGINS` = `["https://scic-frontend-xxx.up.railway.app"]` (tu mettras l'URL frontend après)
3. **Volumes** → New Volume → nom `data`, mount path `/data` (1 GB suffit — pour la DB SQLite)

Note l'URL backend affichée. On s'en sert à l'étape 6.

## Étape 6 — Déployer le frontend (3 min)

```bash
cd ../frontend
railway init
# Choisir : Create new project (ou utilise le même, c'est au choix) → "scic-lieux-communs-frontend"

railway up
```

Dans la console :

1. **Settings → Networking → Generate Domain** → tu obtiens `scic-frontend-xxx.up.railway.app`
2. **Variables** → ajouter :
   - `NEXT_PUBLIC_API_URL` = `https://scic-backend-xxx.up.railway.app` (l'URL de l'étape 5)
3. **Settings → Build** → vérifier que `Dockerfile` est bien sélectionné

Après ajout de la variable, Railway redéploie automatiquement.

Retour au service backend : mettre à jour `SCIC_CORS_ORIGINS` avec la vraie URL frontend (`https://scic-frontend-xxx.up.railway.app`).

## Étape 7 — Tester l'URL publique

Ouvrir dans un navigateur : `https://scic-frontend-xxx.up.railway.app`

Se connecter avec `admin` / `admin123`.

## Étape 8 — Sécurité obligatoire post-déploiement

**IMMÉDIATEMENT après le premier login** :

1. Aller sur **Utilisateurs** (sidebar Équipe)
2. Changer les 3 mots de passe par défaut (admin, saisie, lecture) → clic Edit → remplir le champ password
3. Créer un vrai compte à ton nom (rôle admin) puis supprimer le compte "admin" seed

---

## Mises à jour futures

Après chaque commit sur `main` :

```bash
cd C:/Users/LENOVO/Documents/scic-lieux-communs
git add .
git commit -m "Mise à jour XXX"
git push
railway up    # dans backend/ ou frontend/ selon ce qui a changé
```

Railway auto-build à chaque push si tu actives GitHub integration dans Settings → Source.

---

## Coût

- Gratuit jusqu'à 500 h/mois d'exécution (largement suffisant pour une démo)
- Au-delà : ~5 $/mois/service (backend + frontend = ~10 $/mois)

## Alternative souveraine (après la démo Railway)

Si tu veux basculer vers un hébergement français conforme RGPD après validation : voir [CLOUD_DEPLOY.md option B](CLOUD_DEPLOY.md) — Scaleway Containers (Paris, ~10 €/mois).
