// Commercialisation BRS (méthode du classeur « Simulation BRS » de la SCIC) — appels API authentifiés.
import { req } from "./collab";

export const TRANCHES = ["3-4", "5-6", "7-9"] as const;
export type Tranche = (typeof TRANCHES)[number];
export type Verdict = "financable" | "a_retravailler" | "non_eligible" | "a_completer";

export type TypologieBRS = {
  code: string;
  surface: number;
  prix_ttc: number;
  nb: number;
  subventions: Record<Tranche, number>;
  repartition: Record<Tranche, number>;
};

export type HypothesesBRS = {
  typologies: TypologieBRS[];
  redevance_m2_mois: number;
  charges_m2_mois: number;
  taxe_fonciere_an: number;
  taux_pret: number;
  taux_assurance: number;
  duree_ans: number;
  frais_acquisition: number;
  taux_effort_max: number;
  reste_a_vivre_min_uc: number;
  plafonds: { zone: string; source: string; montants: (number | null)[] };
  deciles: { source: string } & Record<"D3" | "D4" | "D5" | "D6" | "D7" | "D8" | "D9", number>;
  quotites_cibles: Record<Tranche, number>;
};

export type EntreeMenage = {
  reference: string;
  typologie: string;
  adultes: number;
  enfants: number;
  rfr_n2: number;
  revenu_disponible_annuel: number;
  revenus_nets_mensuels: number;
  credits_mensuels: number;
  apport: number;
};

export type Etape = { section: string; label: string; valeur: number | string | null; unite: string };

export type Resultat = {
  reference: string;
  typologie: string;
  personnes: number;
  uc: number;
  plafond: number | null;
  eligible: boolean | null;
  revenu_par_uc: number;
  tranche: Tranche | "hors";
  tranche_libelle: string;
  surface: number;
  prix: number;
  subvention: number;
  prix_net: number;
  frais: number;
  emprunt: number;
  mensualite: number;
  assurance: number;
  redevance: number;
  charges: number;
  taxe_fonciere: number;
  cout_mensuel: number;
  taux_effort: number | null;
  taux_effort_max: number;
  reste_a_vivre: number;
  reste_a_vivre_uc: number;
  reste_a_vivre_min_uc: number;
  verdict: Verdict;
  verdict_libelle: string;
  motifs: string[];
  etapes: Etape[];
};

export type MenageBRS = EntreeMenage & { id: number; notes: string; resultat: Resultat };

export type LigneProgramme = {
  code: string;
  nb: number;
  repartition: Record<Tranche, number>;
  ecart: number;
  controle: string;
  subvention: number;
  prix_brut: number;
  prix_net: number;
};

export type Programme = {
  lignes: LigneProgramme[];
  total: { nb: number; subvention: number; prix_brut: number; prix_net: number } & Record<Tranche, number>;
  quotites_reelles: Record<Tranche, number>;
  quotites_cibles: Record<Tranche, number>;
  subvention_moyenne: number;
  coherent: boolean;
};

export type Couverture = { typologie: string; tranche: Tranche; prevus: number; candidats: number; financables: number };

export type EtatBRS = {
  scenario: { id: number; nom: string; operation_id: number; operation_nom: string };
  hypotheses: HypothesesBRS;
  menages: MenageBRS[];
  programme: Programme;
  couverture: Couverture[];
  synthese: Record<Verdict, number>;
};

const json = (b: unknown) => ({ body: JSON.stringify(b) });

export const brs = {
  lire: (sid: number) => req<EtatBRS>(`/api/brs/scenario/${sid}`),
  enregistrerHypotheses: (sid: number, h: HypothesesBRS) => req<EtatBRS>(`/api/brs/scenario/${sid}/hypotheses`, { method: "PUT", ...json(h) }),
  ajouterMenage: (sid: number, m: Partial<EntreeMenage> & { notes?: string }) =>
    req<EtatBRS>(`/api/brs/scenario/${sid}/menages`, { method: "POST", ...json(m) }),
  modifierMenage: (id: number, m: Partial<EntreeMenage> & { notes?: string }) => req<EtatBRS>(`/api/brs/menages/${id}`, { method: "PUT", ...json(m) }),
  supprimerMenage: (id: number) => req<EtatBRS>(`/api/brs/menages/${id}`, { method: "DELETE" }),
  simuler: (sid: number, m: EntreeMenage) => req<Resultat>(`/api/brs/scenario/${sid}/simuler`, { method: "POST", ...json(m) }),
};

export const LIBELLE_VERDICT: Record<Verdict, string> = {
  financable: "Finançable",
  a_retravailler: "À retravailler",
  non_eligible: "Non éligible",
  a_completer: "À compléter",
};

export const LIBELLE_TRANCHE: Record<Tranche | "hors", string> = { "3-4": "Déciles 3-4", "5-6": "Déciles 5-6", "7-9": "Déciles 7-9", hors: "Hors cible" };
