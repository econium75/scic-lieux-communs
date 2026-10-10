# Audit des fichiers Excel sources — SCIC Lieux Communs

Audit réalisé le 2026-10-09 à partir des 5 fichiers transmis par le client
(+ la note docx V1 et la note PDF V2).

## Vue d'ensemble

| Fichier | Rôle | Feuilles | Taille | Statut audit |
|---|---|---|---|---|
| `Modèle de bilan.xls` | **M2** Bilan promoteur Orly Ecohome | 4 (`BILAN CAHP-94`, `RECAP`, `Bilan Béguinage`, `Récap Béguinage`) | 97 KB | ✅ Complet |
| `Simul PLS.xls` | **M3** Exploitation locative 40 ans | 6 (`SIMUL.xls` 180 cols, `Finan`, `PR`, `Plan de financement prévisionnel`, `Répartition Loyers`, `Tableau des composants`) | 557 KB | ⏳ Structure capturée, détail à venir en S3 |
| `Projet Econ'Home 15 Juin 2023.xlsx` | **M4** Jeu de test commercialisation | 4 (`Candidatures`, `Candidats éligibles`, `Candidature déchus`, `Feuille d'émargement`) | 213 KB | ⏳ 976 candidats, données test |
| `Copie de BRS AMENAGE CALCUL SUBVENTION MENAGES.xlsx` | **M4** DOHIS déciles & subvention ANRU | 2 (`Feuil1`, `DISTRIBUTION DES REVENUS PAR MENAGE`) | 33 KB | ✅ Complet (tables FiLoSoFi + décote) |
| `Tableau de commercialisation 03.02.2026.xlsx` | **M4** Outil opérationnel courant | 2 (`Candidats éligibles`, `Calcul sub ANRU`) + **20 named ranges** | 163 KB | ✅ Complet (formules PMT/IPMT/PPMT) |

---

## 1. Modèle de bilan.xls → M2

### Orly Ecohome — chiffres réels (RECAP)

```
                      BRS (16 lgts)    PLI/Béguinage (14)    TOTAL (30 lgts)
SHAB                  1 265 m²         659 m²                1 924 m²
SDP                   1 361 m²         724 m²                2 085 m²
Communs               0 m²             120 m²                120 m²

FONCIER                 136 082 €        618 837 €              754 919 €
TRAVAUX BÂTIMENT      2 801 991 €      1 675 656 €            4 267 647 €
HONORAIRES BÂTIMENT     417 516 €        255 761 €              673 277 €
COMMERCIALISATION        20 245 €         12 521 €               32 766 €
GESTION ET MOD          387 670 €        221 940 €              609 610 €
FRAIS FINANCIERS         20 846 €         10 518 €               31 363 €
───────────────────── ─────────────── ──────────────────── ─────────────────
PRIX REVIENT HT       3 784 350 €      2 795 231 €            6 579 582 €
PRIX VENTE HT         4 048 937 €      2 504 200 €            6 553 137 €
MARGE BRUTE              53 505 €        -518 686 €              -26 445 €
+ Subventions           160 000 €        800 000 €              960 000 €
                       (Action Log.)   (AGIRC/ARRCO/CNAV)
───────────────────── ─────────────── ──────────────────── ─────────────────
MARGE NETTE             213 505 €        281 314 €              494 819 €
MARGE %                     5,3 %           11,2 %                  7,5 %
```

### Enseignement structurel critique

**Le béguinage n'est PAS équilibré sans la subvention AGIRC/ARRCO/CNAV (800 k€).**
Marge brute PLI = -519 k€. Sans ce financement institutionnel, l'opération
est structurellement déficitaire sur sa partie locative sociale.

→ **M2 doit afficher la marge pré-subvention** à côté de la marge nette, pour
alerter sur la dépendance aux subventions.

### Postes réels (vs mon moteur V0)

Mon moteur session 1 a **9 lignes** regroupées. Le vrai modèle en a **~55 postes
distincts**, répartis en 6 rubriques identiques à mon découpage :

**FONCIER** (12 postes) : acquisition, négociateur, frais notaire 1,8 %, huissier,
frais préliminaires, indemnités, taxe aménagement (35 €/m²), terrain, sondages,
géomètre, démolitions, dépollution, archéologie, préparation terrain, taxe
foncière, participations raccordement (égout 400, eau 300, gaz 600, élec 500,
télécom 350), aléas, VRD.

**TRAVAUX BÂTIMENT** (6 postes) : TCE (2150 €/m² SDP sur Orly), fondations
spéciales, mitoyens, salle commune (1750 €/m²), travaux spécifiques, aléas 3 %.

**HONORAIRES BÂTIMENT** (12 postes) : maîtrise d'œuvre 9 % des travaux,
économiste, BET, organisation pilotage 2,2 %, bureau contrôle 0,45 %, coord.
sécurité 0,4 %, labels 1150 €/lgt, AMO faisabilité 0,5 %, calculs DPE 200 €/lgt,
assurance RC, assurance DO-TRC 1,3 %, aléas.

**COMMERCIALISATION** : publicité 0,2 % du PV, honoraires internes 0,3 %, externes.

**GESTION ET MOD** : OFS 45 k€ (BRS only), règlement copro, maquette, SAV 1000 €/lgt,
RMO hono. gestion interne 5 %, externe 2,5 %.

**FRAIS FINANCIERS** : garantie achèvement, garantie revente 240 €/lgt BRS,
frais financiers internes locaux, externes 0,42 %.

→ **Action pour recaler M2** : passer de 9 à ~55 lignes paramétrables, séparer
ratios €/m² SDP vs €/m² SHAB vs € forfaitaires vs % d'une assiette.

---

## 2. Simul PLS.xls → M3 (session 3)

6 feuilles détectées, la principale `SIMUL.xls` fait **180 colonnes** (très
probablement la projection année par année sur 30-40 ans). Autres feuilles :
- `Finan` (plan de financement initial)
- `PR` (prix de revient)
- `Plan de financement prévisionnel`
- `Répartition Loyers` (32 cols)
- `Tableau des composants` (36 cols, probablement les 10-12 composants bâtiment)

Audit détaillé reporté à la session 3. Les formules des .xls ne sont pas
extractibles via xlrd 1.2 sans mode binaire approfondi — à faire en S3 avec
analyse manuelle complémentaire si nécessaire.

---

## 3. Projet Econ'Home → jeu de recette M4

976 candidatures Orly historiques (2023), 995 éligibles, 992 déchus, feuille
d'émargement. Utilisable comme **jeu de recette** pour M4 — reproduire les
qualifications historiques et vérifier que le moteur donne les mêmes verdicts
que les décisions prises en 2023.

---

## 4. BRS AMENAGE CALCUL SUBVENTION MENAGES (DOHIS)

### Tables FiLoSoFi Insee 2021 — Saint-Denis (zone 1bis IDF)

**Déciles de revenu disponible annuel (€) — Ensemble des ménages :**

| D1 | D2 | D3 | D4 | Médiane | D6 | D7 | D8 | D9 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7 970 | 10 540 | 12 610 | 14 540 | 16 620 | 18 980 | 21 920 | 25 920 | 32 240 |

Déclinaisons par taille de ménage disponibles (1, 2, 3, 4, 5 personnes).

### Grille UC (OECD modifiée)

| Membre | UC |
|---|---:|
| 1er adulte (>18 ans) | 1,0 |
| Adulte supplémentaire | 0,5 |
| Enfant < 14 ans | 0,3 |
| Enfant ≥ 14 ans | 0,5 |

### Décote BRS par décile et typologie

Prix de vente de base pour Orly (zone 1bis) et décote appliquée selon le décile du ménage :

| Typo | PV base | Décile 3-4 (−15 %) | Décile 5-6 (−8 %) | Décile 7-9 (−3 %) |
|---|---:|---:|---:|---:|
| T2 | 181 000 € | 153 900 € | 166 500 € | 175 500 € |
| T3 | 271 600 € | 230 900 € | 249 900 € | 263 400 € |
| T4 | 325 000 € | 276 300 € | 299 000 € | 315 400 € |

### Allocation ANRU cible — Orly 15 logts BRS

- Déciles 3-4 : 30 % des lgts (~5 lgts), subvention moyenne 36 860 €
- Déciles 5-6 : 40 % (~6 lgts), subvention moyenne 20 733 €
- Déciles 7-9 : 30 % (~4 lgts), subvention moyenne 7 200 €
- **Total ANRU : 337 500 €**

Subvention par typologie × décile :

| | T2 | T3 | T4 |
|---|---:|---:|---:|
| D3-4 | 27 100 | 40 700 | 48 700 |
| D5-6 | 14 500 | 21 700 | 26 000 |
| D7-9 | 5 500 | 8 200 | 9 600 |

### Revenu disponible par UC — exemple du fichier

Ménage 3 personnes (1 adulte + 1 enfant <14 + 1 enfant ≥14) :
- UC = 1 + 0,3 + 0,5 = 1,8
- Revenus annuels : activités 25 000 € + prestations CAF 12 000 € = 37 000 €
- **Revenu dispo / UC = 37 000 / 1,8 = 20 555 €** → classé décile 7 (entre 21 920 et…)

→ Mécanisme à implémenter tel quel dans M4.

---

## 5. Tableau de commercialisation 03.02.2026 → M4 référence prioritaire

**Même logique de calcul** que BRS AMENAGE (confirmée identique en table ANRU).
Cette version est l'outil opérationnel courant (février 2026).

### 20 named ranges — formules standards prêt amortissable français

```
Mensualité        = -PMT(Taux_Intérêt/12, Nombre_de_paiements, Montant_du_prêt)
Intérêts         = -IPMT(Taux_Intérêt/12, Numéro_Paiement, Nombre_de_paiements, Montant_du_prêt)
Capital          = -PPMT(Taux_Intérêt/12, Numéro_Paiement, Nombre_de_paiements, Montant_du_prêt)
Fin_Solde        = -FV(Taux_Intérêt/12, Numéro_Paiement, -Mensualité, Montant_du_prêt)
```

→ Formules numpy-financial directement équivalentes : `npf.pmt()`, `npf.ipmt()`,
`npf.ppmt()`, `npf.fv()`.

### Pipeline M4 ménage → qualification

1. Saisir : composition famille, revenus activité + prestations, apport, logement visé (T2/T3/T4)
2. Calculer UC (table OECD ci-dessus)
3. Calculer revenu dispo/UC et classer dans décile FiLoSoFi (table Saint-Denis ou commune)
4. Appliquer décote selon décile → prix de vente ajusté
5. Appliquer subvention ANRU selon décile + typologie
6. Prix net à financer = PV ajusté − subvention − apport
7. Simuler PTZ (durée, taux 0 %) + prêt complémentaire → mensualité
8. Calculer taux d'effort = mensualité / revenu mensuel ménage
9. Calculer reste à vivre par UC et comparer au seuil (≥ 7 à 9 €/UC/jour)
10. Verdict : éligible / limite / non éligible

---

## Points NON résolus par l'audit

| Point | Pourquoi non résolu | Action |
|---|---|---|
| Formules .xls de Modèle de bilan | xlrd 1.2 ne lit pas les formules .xls | Récupérer un .xlsx converti côté client, ou analyser manuellement en S5 |
| Formules .xls de Simul PLS | idem | idem — report S3 |
| Plafonds BRS par zone (hors 1bis) | Ne figurent pas dans les fichiers audités | À demander au client ou à sourcer sur [DGALN](https://www.cohesion-territoires.gouv.fr) |
| Mise à jour FiLoSoFi par commune | Table unique Saint-Denis dans le fichier | API Insee à intégrer en S4 (M1 référentiels) |
| Barème AGIRC/ARRCO/CNAV béguinage | Référencé 800 k€ en forfait | Règles d'attribution à demander au client |

---

## Plan de session mis à jour

| Session | Scope | Prérequis | Statut prérequis |
|---|---|---|---|
| **Session 2a** | **Recaler M2** à 55 lignes fidèles au `Modèle de bilan.xls`, ajouter marge pré-subvention | Fichier dispo | ✅ |
| Session 2b | **M4 Commercialisation BRS** complet (UC, FiLoSoFi, décote, ANRU, PTZ, taux d'effort) | 2 fichiers dispos | ✅ |
| Session 3 | **M3 Exploitation locative** 40 ans | `Simul PLS.xls` | ✅ structure captée |
| Session 4 | M1 référentiels éditables + M5 scénarios | — | — |
| Session 5 | M6 exports au format gabarits + M7 audit | les 5 fichiers | ✅ |
| Session 6 | Auth, RGPD, déploiement souverain | hébergeur arbitré | ❌ en attente |
