# SCIC Lieux Communs — Simulateur SaaS

Outil interactif de simulation de bilans d'exploitation pour la SCIC
Lieux Communs (habitat partagé & béguinage, BRS/PLS/PLI).

Architecture **hybride** décidée en session 1 :

- **Front** : Next.js 14 (App Router) + Tailwind + Recharts
- **Back** : FastAPI (Python 3.11+) avec moteurs financiers en pandas/numpy-financial
- **BDD** : SQLite (SQLModel) — migrable PostgreSQL en V2
- **Exports** : openpyxl (Excel), ReportLab (PDF, session 5)

Référence : *Note de cadrage V2 — 8 septembre 2026* (Incepta Group).

---

## État du projet — Sessions 1 à 7 (V1 étendue — collaboratif cloud)

Livré :

| Module | État | Notes |
|---|---|---|
| **Scaffold** backend + frontend | ✅ | FastAPI 0.143 + Next.js 14.2, tourne end-to-end |
| **M2** Bilan d'opération promoteur | ✅ Fidèle | 26 postes extraits du `Modèle de bilan.xls`, ventilation BRS vs PLI, marge pré/post-subvention |
| **M4** Commercialisation BRS ménage | ✅ Fidèle | UC OECD, FiLoSoFi Saint-Denis 2021, décote BRS, subvention ANRU, plan PTZ+PC, taux d'effort, reste à vivre |
| **M3** Exploitation locative 40 ans | ✅ Fidèle | Prêts (PMT), provision GE par composants, TFPB avec exonération, loyer d'équilibre par dichotomie, projection année par année |
| Page **Synthèse** | ✅ | KPIs + alertes (dont « PLI non viable sans subvention »), mini-recap BRS/PLI |
| Page **Bilan M2** | ✅ | Ventilation 3 colonnes BRS/PLI/Total, sous-totaux par rubrique, détail subventions |
| Page **Commercialisation M4** | ✅ | Table ménages avec verdicts (éligible/limite/non éligible) + détail pipeline + simulateur ad-hoc |
| Page **Exploitation M3** | ✅ | 4 KPIs, alertes, graph 40 ans (recharts), plan de financement, table années clés |
| **M5** Scénarios & sensibilité | ✅ | Liste scénarios avec KPIs, duplication, suppression, édition hypothèses, comparaison 2-à-2, analyse sensibilité 5 paramètres |
| Page **Scénarios** | ✅ | Table enrichie avec PR/marges/CAF, cases à cocher pour comparaison, boutons dupliquer/supprimer |
| Page **Sensibilité** | ✅ | 5 paramètres (foncier, travaux, subv PLI, taux PLS, loyer), graph combo + table |
| Page **Comparaison** | ✅ | KPIs côte-à-côte avec deltas, ventilation par rubrique, alertes des 2 scénarios |
| Page **Hypothèses opération** (M1) | ✅ | Édition inline des 26 postes + ventes + subventions + exploitation + prêts |
| **M6** Exports Excel + PDF | ✅ | 3 Excel formatés (bilan RECAP / exploitation 40 ans / commercialisation ménages) + PDF synthèse ReportLab 1 page A4 |
| **M7** Journal d'audit complet | ✅ | Table AuditLog, filtres (action, type, période), export CSV, UI avec badges colorés |
| **M1** Référentiels globaux éditables | ✅ | Table `Referentiel` en DB avec seed par défaut, édition inline par section, persistance |
| Page **Journal d'audit** | ✅ | Filtres action/type/période + export CSV + badges colorés par action |
| Page **Données & exports** | ✅ | Grille des 4 exports par scénario (3 xlsx + 1 pdf) |
| **Auth JWT** 3 profils (S6) | ✅ | admin/saisie/lecture, bcrypt, require_role, page login, badge sidebar, logout |
| **RGPD** registre + pseudonymisation (S6) | ✅ | Endpoint `/api/rgpd/registre`, pseudonymisation ménages native (référence M-NNN sans PII) |
| **Upload Excel** référentiels (S6) | ✅ | POST multipart avec parse openpyxl + téléchargement gabarit |
| **Déploiement souverain** (S6) | ✅ | Dockerfiles backend/frontend, docker-compose, Caddyfile SSL Let's Encrypt, guide [deploy/DEPLOY.md](deploy/DEPLOY.md) |
| **Admin Users CRUD** (S7) | ✅ | Page `/admin/users` admin-only, création/édition/suppression, 3 rôles |
| **Suivi projet par phases** (S7) | ✅ | 8 phases (Incubation → Clôture), timeline horizontale sur la synthèse, statut hover-éditable, notif responsable |
| **Agenda partagé** (S7) | ✅ | Page `/agenda` : création d'événements (COPIL/COPROJ/jalon/rdv/deadline), participants, notif auto, groupage par jour |
| **Notifications in-app** (S7) | ✅ | Bell dans sidebar avec badge non-lu, popover 20 dernières, marquer-lu, polling 30 s |
| **Cloud internet** (S7) | ✅ | [railway.json](railway.json), [render.yaml](render.yaml), guide [deploy/CLOUD_DEPLOY.md](deploy/CLOUD_DEPLOY.md) — Railway (5 min) / Scaleway Paris / VPS |
| **Pièces jointes** (S8) | ✅ | Attachables à opération/phase/event/scénario, 50 Mo max, upload drag-and-drop, panel sur page synthèse |
| **Import Excel ménages** (S8) | ✅ | Batch depuis page Commercialisation, gabarit téléchargeable, rapport d'import avec erreurs |
| **Import bilan M2** (S8) | ✅ | Depuis page Scénarios, parse auto feuille RECAP/BILAN du Modèle de bilan.xls client → nouveau scénario |
| **Import iCal** (S8) | ✅ | Depuis page Agenda, parse VEVENT (Outlook/Google Calendar/Thunderbird) |
| **Upload Excel référentiels** (S8) | ✅ | Bouton sur chaque carte de la page Paramètres + gabarit pré-rempli téléchargeable |
| **Export ZIP opération** (S8) | ✅ | Zip complet (tous Excel + PDF + pièces jointes) avec README structuré |
| **Seed Orly Ecohome** | ✅ | 30 logts (16 BRS + 14 PLI béguinage) + 5 ménages demo + hypothèses M3 + 6 référentiels + 3 users par défaut |
| **Export Excel M2** | ✅ | Format 2 colonnes BRS/PLI (format gabarit Orly fidèle : session 5) |
| Audit des 5 fichiers Excel sources | ✅ | Rapport dans [docs/audit-fichiers-sources.md](docs/audit-fichiers-sources.md) |
| Upload Excel UI | ⏸ V2 | Endpoint backend prêt, UI frontend à ajouter |
| Pages RGPD UI | ⏸ V2 | Endpoint registre dispo, page UI à ajouter |
| Vue calendrier mensuelle (jour/semaine/mois) | ⏸ V2 | Vue liste par jour en place ; grille mensuelle à ajouter |

### Constat métier critique — confirmé par M2 ET M3

L'audit du `Modèle de bilan.xls` révèle que le **béguinage Orly n'est pas viable
sans la subvention institutionnelle de 800 k€** (AGIRC/ARRCO/CNAV). Marge brute
PLI = -328 k€, redressée à +472 k€ grâce à cette subvention. L'app affiche
systématiquement cette double marge (pré et post-subvention) pour alerter sur
la dépendance.

**Session 3 confirme le constat en exploitation** : avec le plan de financement
PLS CDC + PLAI + Action Logement, le loyer d'équilibre sur 40 ans ressort à
**16,15 €/m²/mois** vs un plafond PLS zone 1bis de 11,80 €/m²/mois. CAF année 1
= -75 k€, cumul trésorerie 40 ans = -2,17 M€. L'opération n'est viable qu'avec
subventions institutionnelles additionnelles ou un financement spécifique
hors cadre PLS standard.

Note : le `Modèle de bilan.xls` client contient une **erreur arithmétique** dans
le total de la rubrique TRAVAUX BÂTIMENT (manque les 210 k€ de salle commune
dans le sous-total). Notre moteur fait la somme correcte (4 477 647 € vs
4 267 647 € affiché dans le fichier).

### Plan séquentiel des sessions suivantes

| Session | Scope | Prérequis |
|---|---|---|
| 2 | M4 Commercialisation BRS (décile, PTZ, taux d'effort, reste à vivre) | `Tableau_de_commercialisation_03_02_2026.xlsx` |
| 3 | M3 Exploitation locative PLS 40 ans | `Simul_PLS.xls` |
| 4 | M1 référentiels éditables + M5 scénarios/sensibilité | — |
| 5 | M6 exports fidèles aux gabarits + M7 audit complet | les 6 fichiers Excel sources |
| 6 | Auth, RGPD, déploiement souverain (Scaleway/OVH) | hébergeur choisi |

---

## Démarrage local

### Backend

> ⚠️ **Python 3.11 ou 3.12 recommandé.** Les versions 3.13/3.14 n'ont pas
> encore de wheels pré-compilées pour pandas/numpy — l'install va alors
> compiler depuis les sources (long, exige MSVC Build Tools sous Windows).

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # Linux/macOS
pip install -r requirements.txt
uvicorn app.main:app --reload
```

→ API sur `http://localhost:8000` · Docs sur `http://localhost:8000/docs`

Au premier démarrage, un `scic.db` SQLite est créé et seedé avec Orly Ecohome.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

→ UI sur `http://localhost:3000`. Les appels `/api/*` sont rewrités vers le backend
via `next.config.mjs`.

---

## Arborescence

```
scic-lieux-communs/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI + CORS + routers
│   │   ├── config.py            # Settings pydantic
│   │   ├── db.py                # SQLModel + SQLite
│   │   ├── models.py            # Operation, Scenario, Menage, AuditLog
│   │   ├── seed.py              # Jeu Orly Ecohome
│   │   ├── engines/
│   │   │   └── bilan.py         # ★ Moteur M2 complet
│   │   └── routers/
│   │       ├── operations.py    # CRUD opérations
│   │       ├── scenarios.py     # Hypothèses + duplication
│   │       ├── calculs.py       # /api/calculs/bilan/{id}
│   │       ├── menages.py       # M4 placeholder
│   │       ├── referentiels.py  # M1 defaults
│   │       ├── exports.py       # Excel du bilan
│   │       └── audit.py         # M7
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── layout.tsx                        # Sidebar persistante
    │   ├── page.tsx                          # Redirect → 1ʳᵉ opération
    │   ├── operations/[id]/
    │   │   ├── page.tsx                      # ★ Synthèse (maquette v0.9)
    │   │   ├── bilan/page.tsx                # ★ M2 full
    │   │   ├── bilan/cashflow-chart.tsx
    │   │   ├── exploitation/page.tsx         # Placeholder M3
    │   │   ├── commercialisation/page.tsx    # Placeholder M4
    │   │   ├── bilan-exploitation/page.tsx   # Placeholder
    │   │   └── scenarios/page.tsx            # M5 (lecture seule)
    │   ├── parametres/page.tsx               # M1 lecture seule
    │   └── donnees-exports/page.tsx          # M6 (export Excel brut)
    ├── components/
    │   ├── sidebar.tsx
    │   ├── kpi-card.tsx
    │   ├── alerte-item.tsx
    │   └── placeholder.tsx
    ├── lib/
    │   ├── api.ts
    │   ├── types.ts
    │   └── format.ts
    └── package.json
```

---

## Ce qui N'EST PAS fait

Pour mémoire, afin d'éviter toute illusion sur l'état d'avancement :

- Les formules du moteur M2 ne reproduisent **pas** encore ligne-à-ligne
  `Modèle_de_bilan.xls` — elles sont « raisonnablement standard du marché
  promoteur social ». Le cahier de recette (§P2 de la note V2) reste à bâtir.
- Pas d'authentification (gestion des 3 profils admin/saisie/lecture : session 6).
- Pas de pseudonymisation RGPD des données ménages (session 6).
- Pas de versioning formel des hypothèses (session 4).
- Pas de tests pytest (session 2 — recommandé en TDD à partir des fichiers Excel sources).
- Pas de déploiement souverain (session 6, hébergeur à arbitrer).

---

## Licence

Code produit pour Incepta Group Pte. Ltd. — cession pleine prévue au client
dans la lettre de mission (cf. §13.2).
