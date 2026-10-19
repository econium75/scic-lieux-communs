// Types et constantes du simulateur 8 onglets (miroir de backend/app/engines/simulateur.py)

export const PRODUITS = ["PLAI", "PLUS", "PLS", "PLI", "BRS"] as const;
export type Produit = (typeof PRODUITS)[number];
export const LOCATIFS: Produit[] = ["PLAI", "PLUS", "PLS", "PLI"];
export const ZONES_123 = ["Z1bis", "Z1", "Z2", "Z3"] as const;
export const ZONES_ABC = ["Abis", "A", "B1", "B2", "C"] as const;
export const RUBRIQUES = [
  "FONCIER",
  "TRAVAUX BÂTIMENT",
  "HONORAIRES BÂTIMENT",
  "COMMERCIALISATION",
  "GESTION ET MOD",
  "FRAIS FINANCIERS",
] as const;
export const TYPOLOGIES = ["T1", "T2", "T2 bis", "T3", "T4", "T5"];
export const CATEGORIES_RESERVATAIRES = [
  "État – publics prioritaires",
  "État – agents publics",
  "Action Logement",
  "Commune",
  "EPCI",
  "Département",
  "Région",
  "Autre réservataire",
  "Non réservé (bailleur)",
];
export const STATUTS_RESERVATION = ["Réservé", "Attribué", "Restitué au bailleur", "Vacant"];

export const ONGLETS = [
  { key: "hypotheses", num: 1, label: "Hypothèses", court: "Hypothèses", editable: true },
  { key: "programme", num: 2, label: "Programme et loyers", court: "Loyers", editable: true },
  { key: "prix-revient", num: 3, label: "Prix de revient", court: "Prix de revient", editable: true },
  { key: "financement", num: 4, label: "Plan de financement", court: "Financement", editable: true },
  { key: "reservations", num: 5, label: "Réservations", court: "Réservations", editable: true },
  { key: "bilan-operation", num: 6, label: "Bilan d'opération", court: "Bilan d'op.", editable: false },
  { key: "exploitation", num: 7, label: "Bilan d'exploitation", court: "Exploitation", editable: false },
  { key: "synthese", num: 8, label: "Synthèse", court: "Synthèse", editable: false },
] as const;
export type OngletKey = (typeof ONGLETS)[number]["key"];

export type ParProduit<T = number> = Record<Produit, T>;
export type ParProduitTotal = ParProduit & { total: number };

export type ProgrammeRow = { typologie: string; nb: number; shab: number; annexe: number };
export type LignePR = {
  id: string;
  rubrique: string;
  libelle: string;
  montants: ParProduit;
  custom: boolean;
};
export type NatureFinancement = "subvention" | "pret" | "fonds_propres";
export type FinComplementaire = {
  id: string;
  libelle: string;
  nature: NatureFinancement;
  montants: ParProduit;
  taux: number;
  duree: number;
};
export type Reservation = {
  id: string;
  logement: string;
  typologie: string;
  produit: string;
  categorie: string;
  reservataire: string;
  convention: string;
  date_signature: string;
  date_echeance: string;
  mode: string;
  statut: string;
  contact: string;
  observations: string;
};

export type Conditions = { taux: number; duree: number };
export type Hypotheses = {
  nom_operation: string;
  commune: string;
  zone_123: string;
  zone_abc: string;
  annee_livraison: number;
  annee_bareme: number;
  charge_fonciere_m2: number;
  travaux_m2: number;
  honoraires_pct: number;
  aleas_pct: number;
  frais_annexes_logt: number;
  decote_fonciere_brs_pct: number;
  tva: ParProduit;
  tva_cession_brs: number;
  subv_etat_logt: ParProduit;
  subv_collectivites_logt: number;
  subv_action_logement_logt: number;
  fonds_propres_pct: number;
  prets: ParProduit<{ taux: number; duree: number; duree_foncier: number }>;
  quotite_fonciere_mode: "prorata" | "pct_charge_fonciere";
  quotite_fonciere_pct: number;
  pret_cnav: Conditions;
  pret_action_logement: Conditions;
  pret_complementaire: Conditions;
  loyer_plafond: ParProduit;
  indexation_loyers: number;
  vacance: number;
  impayes: number;
  frais_gestion_pct: number;
  entretien_logt: number;
  pge_logt: number;
  assurance_logt: number;
  inflation_charges: number;
  tfpb_logt: number;
  exoneration_tfpb_ans: number;
  parkings_nb: number;
  parking_loyer_mensuel: number;
  rls_logt_mois: number;
  rls_part_logements: number;
  taux_actualisation: number;
  duree_projection: number;
  annexe_plafond_m2: number;
  annexe_ponderation: number;
  prix_vente_brs_m2_su: number;
};

export type SimData = {
  version: number;
  hypotheses: Hypotheses;
  programme: Record<Produit, ProgrammeRow[]>;
  prix_revient: { lignes: LignePR[] };
  financement: {
    montants: Record<string, Record<Produit, number | null>>;
    complementaires: FinComplementaire[];
  };
  reservations: Reservation[];
};

export type LigneProgrammeCalc = {
  typologie: string;
  nb: number;
  shab_moy: number;
  shab_totale: number;
  annexe_brute: number;
  annexe_retenue: number;
  su_moy: number;
  su_totale: number;
  loyer_m2: number;
  loyer_mensuel_logt: number;
  loyer_annuel_logt: number;
  loyer_annuel_total: number;
};
export type ProduitProgramme = {
  lignes: LigneProgrammeCalc[];
  nb: number;
  shab: number;
  su: number;
  loyer_annuel: number;
  loyer_m2: number;
  su_moy: number;
};
export type LigneFinCalc = {
  id: string;
  libelle: string;
  nature: NatureFinancement;
  auto: boolean;
  montants: ParProduit;
  sources: ParProduit<"auto" | "saisie" | "vide">;
  total: number;
  taux: number | null;
  duree: number | null;
  complementaire: boolean;
};
export type Pret = {
  libelle: string;
  produit: Produit;
  montant: number;
  taux: number;
  duree: number;
  type: string;
  annuite: number;
};
export type LigneExploitation = {
  annee: number;
  annee_civile: number;
  coef_indexation: number;
  loyers: number;
  redevances_brs: number;
  parkings: number;
  vacance: number;
  impayes: number;
  rls: number;
  produits_nets: number;
  frais_gestion: number;
  entretien: number;
  pge: number;
  assurance: number;
  tfpb: number;
  charges: number;
  autofinancement_brut: number;
  annuites: number;
  autofinancement_net: number;
  cumul: number;
  autof_sur_loyers: number;
  annuites_sur_loyers: number;
  dscr: number | null;
  flux_cumule_fp: number;
};
export type LigneBRS = {
  annee: number;
  annee_civile: number;
  redevances: number;
  impayes: number;
  frais_gestion: number;
  annuites: number;
  solde: number;
  cumul: number;
};
export type Alerte = { niveau: "danger" | "warn" | "info"; onglet: OngletKey; message: string };
export type Structure = { subventions: ParProduitTotal; fonds_propres: ParProduitTotal; emprunts: ParProduitTotal; cession: ParProduitTotal };

export type Bareme = {
  millesime: number;
  loyers_plai: Record<string, number>;
  loyers_plus: Record<string, number>;
  loyers_pls: Record<string, number>;
  loyers_pli: Record<string, number>;
  brs_prix_plafond_m2_su: Record<string, number>;
  taux: Record<string, number>;
  regles: Record<string, number>;
};

export type SimResult = {
  programme: {
    par_produit: Record<Produit, ProduitProgramme>;
    total: { nb: number; shab: number; su: number; loyer_annuel: number; nb_locatif: number; loyer_annuel_locatif: number };
  };
  prix_revient: {
    lignes: (LignePR & { total_ht: number })[];
    par_rubrique: Record<string, ParProduitTotal>;
    ht: ParProduitTotal;
    taux_tva: ParProduit;
    tva: ParProduitTotal;
    ttc: ParProduitTotal;
    part_fonciere: ParProduit;
    par_logement: ParProduitTotal;
    par_m2_shab: ParProduitTotal;
    nb_lignes_supplementaires: number;
  };
  financement: {
    lignes: LigneFinCalc[];
    cession_brs: {
      prix_saisi_m2: number;
      prix_plafond_m2: number;
      prix_retenu_m2: number;
      su: number;
      produit_ht: number;
      produit_ttc: number;
      prix_ttc_logt: number;
      cout_bati: number;
      affectee: number;
      marge: number;
      plafonne: boolean;
    };
    emprunt_equilibre: ParProduitTotal;
    quotite_fonciere: ParProduitTotal;
    quotite_construction: ParProduitTotal;
    excedent: ParProduitTotal;
    total_ressources: ParProduitTotal;
    controle: ParProduitTotal;
    subventions: ParProduitTotal;
    fonds_propres: ParProduitTotal;
    emprunts: ParProduitTotal;
    cession_affectee: ParProduitTotal;
    structure: Structure;
    prets: Pret[];
    annuites_annee1: ParProduitTotal;
    nb_complementaires: number;
  };
  reservations: {
    nb_lignes: number;
    nb_logements_programme: number;
    nb_reserves: number;
    taux_reservation: number;
    par_categorie: { categorie: string; nb: number; part: number }[];
    par_statut: Record<string, number>;
    quotas: { libelle: string; nb: number; part: number; plafond: number; depasse: boolean }[];
    echeances_proches: { logement: string; reservataire: string; date_echeance: string; jours: number }[];
  };
  bilan_operation: {
    emplois: Record<string, ParProduitTotal>;
    ht: ParProduitTotal;
    tva: ParProduitTotal;
    ttc: ParProduitTotal;
    par_logement: ParProduitTotal;
    par_m2_shab: ParProduitTotal;
    ressources: { libelle: string; nature: NatureFinancement; montants: ParProduit; total: number }[];
    cession_affectee: ParProduitTotal;
    emprunt_equilibre: ParProduitTotal;
    total_ressources: ParProduitTotal;
    controle: ParProduitTotal;
    structure: Structure;
  };
  exploitation: Exploitation;
  exploitation_avec_brs: Exploitation;
  synthese: Synthese;
  synthese_sans_brs: Synthese;
  alertes: Alerte[];
  bareme: Bareme;
  limites: { lignes_supplementaires: number; financements_complementaires: number };
};

/** Périmètre des onglets 7 et 8 : avec les BRS (locatif + compte OFS) ou sans (locatif seul). */
export type PerimetreBRS = "avec" | "sans";

export type Exploitation = {
  perimetre: "avec_brs" | "sans_brs";
  lignes: LigneExploitation[];
  brs: LigneBRS[];
  kpis: {
    autofinancement_net_a1: number;
    autof_sur_loyers_a1: number;
    annuites_sur_loyers_a1: number;
    dscr_a1: number | null;
    cumul_40: number;
    cumul_fin: number;
    annee_equilibre: number | null;
    annee_retour_fonds_propres: number | null;
    fonds_propres_investis: number;
    tri_fp_40: number | null;
    tri_fp_fin: number | null;
    van_40: number;
    nb_annees: number;
    nb_logements: number;
  };
};

export type Synthese = {
  perimetre: "avec_brs" | "sans_brs";
  a_des_brs: boolean;
  titre: string;
  zones: { zone_123: string; zone_abc: string };
  annee_livraison: number;
  nb_logements: number;
  shab: number;
  su: number;
  prix_revient_ttc: number;
  prix_revient_logt: number;
  prix_revient_m2: number;
  autofinancement_net_a1: number;
  dscr_a1: number | null;
  annee_equilibre: number | null;
  fonds_propres_total: number;
  subventions_total: number;
  emprunts_total: number;
  cession_affectee: number;
  annuites_a1: number;
  repartition: { produit: Produit; nb: number; shab: number; su: number; prix_revient_ttc: number; loyer_m2: number; loyer_annuel: number }[];
  structure: { poste: string; montant: number; part: number }[];
  brs: { produit_cession_ht: number; marge_cession: number; solde_ofs_a1: number | null };
};

export type SimulationPayload = {
  operation_id: number;
  operation: { id: number; code: string; nom: string; commune: string };
  data: SimData;
  result: SimResult;
  updated_at: string;
  updated_by: string;
};

export function nouvelId(prefixe: string): string {
  return `${prefixe}_${Math.random().toString(36).slice(2, 10)}`;
}

export function exportUrl(opId: number, onglet: string, brs?: PerimetreBRS): string {
  const q = brs && (onglet === "exploitation" || onglet === "synthese") ? `?brs=${brs}` : "";
  return `/api/simulations/operation/${opId}/export/${onglet}${q}`;
}

/** Résultats des onglets 7 et 8 pour le périmètre choisi (sans BRS si l'opération n'en a pas : identique). */
export function selonPerimetre(result: SimResult, brs: PerimetreBRS): { exploitation: Exploitation; synthese: Synthese } {
  const avec = brs === "avec" && result.synthese.a_des_brs;
  return {
    exploitation: avec ? result.exploitation_avec_brs : result.exploitation,
    synthese: avec ? result.synthese : result.synthese_sans_brs,
  };
}
