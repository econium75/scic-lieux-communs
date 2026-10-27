export type Operation = {
  id: number;
  code: string;
  nom: string;
  commune: string;
  zone_brs: string;
  nb_logements_total: number;
  nb_logements_brs: number;
  nb_logements_pls: number;
  nb_logements_pli: number;
  nb_logements_pluspai: number;
  surface_habitable_m2: number;
  livraison_cible: string;
};

export type Scenario = {
  id: number;
  operation_id: number;
  nom: string;
  is_reference: boolean;
  hypotheses: Record<string, unknown>;
  bilan_result?: BilanResult | null;
  exploitation_result?: unknown;
};

// ===================================================================
// M2 — Bilan opération
// ===================================================================

export type Volet = "BRS" | "PLI";
export type Rubrique =
  | "FONCIER"
  | "TRAVAUX BÂTIMENT"
  | "HONORAIRES BÂTIMENT"
  | "COMMERCIALISATION"
  | "GESTION ET MOD"
  | "FRAIS FINANCIERS";

export type LigneResult = {
  rubrique: Rubrique;
  poste: string;
  brs: number;
  pli: number;
  total: number;
  ratio_commentaire: string;
};

export type TotalRubrique = {
  rubrique: Rubrique;
  brs: number;
  pli: number;
  total: number;
};

export type SousBilan = {
  volet: Volet;
  nb_logements: number;
  shab_m2: number;
  sdp_m2: number;
  prix_revient_ht: number;
  prix_vente_ht: number;
  marge_brute: number;
  subventions: number;
  marge_nette: number;
  marge_nette_pct: number;
  pr_m2_shab: number;
};

export type Alerte = {
  severity: "info" | "attention" | "critique";
  titre: string;
  detail: string;
};

export type BilanResult = {
  operation_code: string;
  nom: string;
  commune: string;
  livraison_cible: string;
  nb_logements_total: number;
  nb_logements_brs: number;
  nb_logements_pli: number;
  shab_total_m2: number;
  sdp_total_m2: number;
  prix_revient_ht_total: number;
  prix_revient_m2_shab: number;
  prix_vente_ht_total: number;
  subventions_totales: number;
  marge_brute_totale: number;
  marge_nette_totale: number;
  marge_nette_pct: number;
  cash_flow_apport_quasi_fp: number;
  sous_bilans: SousBilan[];
  lignes: LigneResult[];
  totaux_rubriques: TotalRubrique[];
  subventions_detail: { volet: Volet; source: string; montant: number }[];
  alertes: Alerte[];
};

// ===================================================================
// M3 — Exploitation locative
// ===================================================================

export type AnneeExploitation = {
  annee_num: number;
  annee_civile: number;
  loyers_bruts: number;
  impayes: number;
  loyers_nets: number;
  aides_recettes_annexes: number;
  produits_totaux: number;
  tfpb: number;
  frais_gestion: number;
  autres_charges: number;
  provision_ge: number;
  charges_exploit: number;
  interets_prets: number;
  capital_rembourse: number;
  annuites_totales: number;
  resultat_tresorerie: number;
  amortissements: number;
  resultat_comptable: number;
  caf: number;
  autofinancement_net: number;
  cumul_tresorerie: number;
};

export type PretDetail = {
  nom: string;
  montant: number;
  taux_pct: number;
  duree_ans: number;
  annuite_cible: number;
  total_interets: number;
  total_capital_rembourse: number;
};

export type ExploitationResult = {
  operation_code: string;
  nom: string;
  annee_mise_en_service: number;
  duree_projection_ans: number;
  nb_logements: number;
  shab_m2: number;
  loyer_annuel_initial: number;
  loyer_m2_mois_initial: number;
  loyer_equilibre_m2_mois: number;
  plafond_pls_m2_mois_indicatif: number;
  conforme_plafond: boolean;
  caf_annee_1: number;
  caf_moyenne_40_ans: number;
  cumul_tresorerie_fin: number;
  tresorerie_minimale: number;
  annee_tresorerie_minimale: number;
  annees: AnneeExploitation[];
  totaux: Record<string, number>;
  prets_detail: PretDetail[];
  alertes: Alerte[];
};
