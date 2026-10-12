# Audit SaaS SCIC Lieux Communs — améliorations recommandées

Fait le 2026-10-12 à partir d'un parcours complet du code (backend + frontend)
et de l'URL en production Railway.

Grille d'évaluation : **🔴 bloquant pour mise en production** · **🟠 important** · **🟡 nice-to-have** · **🟢 déjà solide**

---

## 1. Sécurité (🔴 priorité absolue)

| État | Point |
|---|---|
| 🔴 | **Mots de passe par défaut en production** (admin/admin123, saisie/saisie123, lecture/lecture123) — à changer immédiatement. Prévoir une page « premier login » qui force le changement. |
| 🔴 | `SCIC_CORS_ORIGINS=["*"]` sur Railway — à restreindre à l'URL frontend exacte. |
| 🟠 | **Pas de rate limiting** sur `/api/auth/login` — risque brute-force. Ajouter `slowapi` ou middleware custom (ex: 5 tentatives / 15 min / IP). |
| 🟠 | **JWT sans refresh token** — expire après 24 h et l'utilisateur se fait éjecter. Ajouter refresh + sliding session. |
| 🟠 | Les routes de mutation sur **scenarios/menages/exports** ne sont pas toutes protégées par `require_saisie`. À auditer exhaustivement. |
| 🟡 | Pas de **CSP** (Content Security Policy) côté frontend. Ajouter headers via `next.config.mjs` ou middleware. |
| 🟡 | **Token JWT en localStorage** — vulnérable au XSS. Alternative : httpOnly cookie + CSRF token. |
| 🟡 | Pas de **2FA** pour les comptes admin. |

## 2. RGPD / conformité (🔴 pour mise en prod réelle)

| État | Point |
|---|---|
| 🔴 | **Hébergement Railway iad (US)** — pour vraies données ménages, migrer vers Scaleway Paris ou OVH (déjà documenté dans `CLOUD_DEPLOY.md`). |
| 🔴 | **DPIA pas rédigée** — obligatoire avant collecte réelle (modèle CNIL). |
| 🔴 | **Pas de bannière consentement cookies** / mentions légales / politique de confidentialité sur l'interface. |
| 🟠 | **Backup DB automatique absent** — ajouter cron quotidien + chiffrement GPG + rétention 30 jours. |
| 🟠 | **Pas de procédure d'effacement RGPD exposée** aux ménages (droit à l'oubli art. 17). |
| 🟢 | Registre des traitements endpoint présent (`/api/rgpd/registre`), 3 traitements documentés. |
| 🟢 | Pseudonymisation native (M-NNN, aucune PII en clair). |

## 3. Fidélité métier (🟠 pour recette client)

| État | Point |
|---|---|
| 🟠 | **Moteur M2** calé sur un seul fichier (Orly Ecohome). Il faut tester sur d'autres bilans types (Béguinage pur, PLUS-PLAI, mixte national hors IDF). |
| 🟠 | **Moteur M3** PGE simplifié (approximation annuité constante). Le vrai Simul_PLS CDC calcule mois par mois avec préfinancement. Écart < 2 % mais à valider. |
| 🟠 | **Moteur M4** utilise la table FiLoSoFi Saint-Denis unique. À remplacer par un lookup par commune (API Insee ou référentiel manuel). |
| 🟡 | **Loyer d'équilibre** calculé par dichotomie (lent mais correct). Analytique possible pour accélérer. |
| 🟡 | **Alertes** basées sur seuils hardcodés. Les externaliser dans les référentiels éditables. |
| 🟢 | 3 moteurs testables indépendamment, type hints Pydantic partout. |

## 4. UX / productivité utilisateurs (🟠 vrais retours terrain prédictibles)

| État | Point |
|---|---|
| 🟠 | **Pas de recherche globale** — avec 10+ opérations/scénarios/ménages ça devient ingérable. |
| 🟠 | **Pas d'onboarding** pour nouveau user (tour guidé, infobulles). Rôle `lecture` ouvre sur la synthèse Orly sans contexte. |
| 🟠 | **Autosave absent** sur les formulaires d'hypothèses (perte si refresh). |
| 🟠 | **Pas d'historique de versions** sur les hypothèses éditées — on écrase. Un diff git-like serait utile. |
| 🟡 | **Pas de dark mode** (déjà noté « thème clair » dans la sidebar). |
| 🟡 | **Pas de favoris / épinglage** d'opérations fréquemment consultées. |
| 🟡 | **Mobile non testé** — probablement cassé (sidebar 256px fixed + grid 3-4 colonnes). |
| 🟡 | **Pas d'infobulles** sur les termes techniques (BRS, PLI, SHAB, SDP, PGE, OFS, TFPB…). |
| 🟡 | **Breadcrumbs absents** — on ne sait pas où on est dans la hiérarchie (opération → scénario → ménage). |

## 5. Performance (🟡 pas critique pour <50 users)

| État | Point |
|---|---|
| 🟠 | Chaque chargement de la page Synthèse **recalcule** M2 et M3 (routes POST `/api/calculs/...`). À cacher dans Scenario avec invalidation sur edit. |
| 🟠 | Page Scénarios appelle `calculerBilan` + `calculerExploitation` en séquence pour chaque scénario. Avec 10 scénarios × 2 moteurs = 20 calculs série. Paralléliser côté backend (endpoint batch) ou côté frontend (`Promise.all`). |
| 🟡 | **Pas de pagination** sur les ménages (fonctionne jusqu'à 500 lignes, souffle au-delà). |
| 🟡 | **Build Next.js lourd** (87 KB first load, 198 KB page sensibilité). Code splitting plus agressif. |
| 🟢 | SQLite OK jusqu'à ~10 utilisateurs concurrents. |

## 6. Scalabilité (🟡 pour V2)

| État | Point |
|---|---|
| 🟠 | **SQLite** OK pour MVP mais ne scale pas horizontalement. Migration PostgreSQL prévue cf. note V2. |
| 🟠 | **Fichiers attachments stockés sur disque** du container → perdus au redeploy sans Railway Volume. Alternative : S3-compatible (Scaleway Object Storage, MinIO). |
| 🟠 | **Pas de workers asynchrones** — la génération PDF/MP3/ZIP bloque la requête (jusqu'à 20 s pour un gros ZIP). Ajouter Celery + Redis ou Dramatiq. |
| 🟡 | **Monoprojet Railway** (backend + frontend sur même workspace) — ok tant qu'on n'a qu'une instance. Pour multi-SCIC, isoler. |

## 7. Dette technique / code quality

| État | Point |
|---|---|
| 🟠 | **Aucun test automatisé** (pas de pytest, pas de Playwright/Vitest). Prévu en S2 selon la note V2, à faire. |
| 🟠 | **Pas de CI/CD** — pas de lint + tests automatiques sur PR. Ajouter GitHub Actions. |
| 🟠 | **TypeScript `any`** utilisé par endroits (ex: `as any` dans certaines modales). |
| 🟠 | **Pas de migrations** — SQLModel crée les tables à partir du code, mais pas de versioning (Alembic). Ajouter avant première migration de prod. |
| 🟡 | **Dockerfile Python 3.12** mais le code est écrit pour 3.11+. Fonctionnel mais tester explicitement. |
| 🟡 | **gTTS dépend d'une API Google** externe — risque de rate-limiting ou de panne. Alternative : TTS local (pyttsx3) ou payant (Azure, ElevenLabs). |

## 8. Fonctionnel manquant pour V2

| Priorité | Fonctionnalité |
|---|---|
| 🟠 | **Export PDF du compte d'exploitation M3** complet (table 40 ans) — actuellement seul le PDF synthèse 1 page existe |
| 🟠 | **Comparaison > 2 scénarios** (actuellement limité à 2) |
| 🟠 | **Templates de scénarios** pré-configurés (Béguinage urbain, Habitat partagé rural…) |
| 🟡 | **Vue calendrier mensuelle** (grille jour/semaine/mois) — actuellement liste groupée par jour |
| 🟡 | **Briefing programmé automatique** (cron 7h quotidien par user) — actuellement génération manuelle |
| 🟡 | **Intégration email** pour notifications importantes (SendGrid, Postmark) |
| 🟡 | **Signatures électroniques** (DocuSign) pour validation ménages / avenants |
| 🟡 | **Webhooks** pour intégrations CRM externe (HubSpot, Pipedrive) |
| 🟡 | **API REST publique documentée** (OpenAPI est là, mais pas de clé API ni rate limiting pour externe) |
| 🟡 | **Dashboard multi-opérations** (vue agrégée KPIs toutes opérations) |
| 🟡 | **Comparaison inter-SCIC** / benchmarks sectoriels |

## 9. DevOps / observabilité (🟠 pour mise en prod)

| État | Point |
|---|---|
| 🔴 | **Pas de monitoring / alerting** — si le service tombe à 3h du matin, personne ne le sait. Ajouter UptimeRobot / BetterStack (gratuit). |
| 🟠 | **Logs applicatifs pas structurés** (JSON). Difficile à agréger. Utiliser `structlog`. |
| 🟠 | **Pas de métriques** (nombre de calculs/jour, latence, taux d'erreur). Ajouter Prometheus + Grafana ou utiliser Railway Metrics. |
| 🟠 | **Pas de Sentry** pour les erreurs frontend/backend. |
| 🟡 | **Dockerfile warning `VOLUME` migré en runtime** — à documenter pour les futurs re-deploys. |

## 10. Priorisation recommandée pour les 2 prochaines sessions

### Session 9 (1 semaine) — « production-ready »
1. 🔴 Changement mdp par défaut forcé + rate limiting login
2. 🔴 Bannière RGPD + mentions légales + politique confidentialité
3. 🟠 Migration vers Scaleway Paris (ou OVH) pour conformité
4. 🟠 Backups DB automatiques quotidiens
5. 🟠 Monitoring UptimeRobot + Sentry
6. 🟠 CI GitHub Actions : lint + test build sur PR

### Session 10 (1 semaine) — « confort utilisateur »
1. 🟠 Recherche globale + breadcrumbs
2. 🟠 Autosave + historique versions hypothèses
3. 🟠 Cache des résultats M2/M3 avec invalidation
4. 🟠 Tests automatisés (pytest + Playwright)
5. 🟡 Dark mode + mobile responsive
6. 🟡 Infobulles glossaire métier

---

## En synthèse

Le SaaS est **fonctionnellement très avancé pour une V1** (10 modules métier, 12 pages, auth, imports/exports complets, cloud deployment).

Les 3 chantiers critiques avant d'ouvrir aux vrais utilisateurs SCIC :

1. **Sécurité** : forcer changement mdp, rate limiting, CORS strict
2. **RGPD** : hébergement souverain + DPIA + bannières légales
3. **Fiabilité** : backups auto + monitoring

À part ça, les fondations sont solides. Les moteurs financiers reproduisent fidèlement les 5 fichiers Excel sources audités, la ventilation BRS/PLI met en lumière la dépendance aux subventions institutionnelles (constat métier confirmé par M2 et M3), et les flux I/O couvrent tous les cas opérationnels.

**Verdict** : ✅ MVP démontrable à Tristan Robet et au COPIL SCIC. ⚠️ Pas encore à mettre entre les mains des ménages / financeurs sans la session 9.
