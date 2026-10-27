// Suivi des projets et facturation — appels API authentifiés.
import { req } from "./collab";

export type StatutEtape = "a_venir" | "en_cours" | "terminee";
export type StatutProjet = "en_cours" | "termine" | "suspendu" | "abandonne";
export type StatutFacture = "brouillon" | "emise" | "payee" | "annulee";

export type Payeur = "client" | "collectivite" | "promoteur" | "financeur";
export type RegleFacturation = {
  mode: "aucune" | "forfait" | "pourcentage";
  montant: number;
  taux: number;
  base: "honoraires" | "ca_ttc";
  payeur: Payeur;
  nature: "facture" | "financement";
};
export const REGLE_VIDE: RegleFacturation = { mode: "aucune", montant: 0, taux: 0, base: "honoraires", payeur: "client", nature: "facture" };

export type Etape = {
  id: string;
  phase: string;
  nom: string;
  description: string;
  facturation: RegleFacturation;
  regle_libelle: string;
  payeur_nom: string;
  statut: StatutEtape;
  date_prevue: string | null;
  date_realisation: string | null;
  modeles: number[];
  montant_ht: number;
  facture: { id: number; numero: string | null; statut: StatutFacture; total_ttc: number } | null;
};

export type Partie = { nom: string; adresse: string; siren: string; contact: string; email: string };
export type Financement = { etape_id: string; nom: string; montant: number; financeur: string; obtenu: boolean };

export type Projet = {
  id: number;
  code: string;
  nom: string;
  client_nom: string;
  client_adresse: string;
  client_siren: string;
  client_contact: string;
  client_email: string;
  operation_id: number | null;
  operation_nom: string | null;
  responsable: string;
  responsable_nom: string;
  montant_ht: number;
  taux_tva: number;
  ca_previsionnel_ttc: number;
  taux_honoraires: number;
  tiers: Record<"collectivite" | "promoteur" | "financeur", Partie>;
  statut: StatutProjet;
  date_debut: string | null;
  notes: string;
  etapes: Etape[];
  avancement: number;
  nb_etapes: number;
  nb_etapes_terminees: number;
  etape_en_cours: string | null;
  phase_en_cours: string | null;
  total_facturable_ht: number;
  part_honoraires_planifiee: number;
  financements: Financement[];
  facture_ht: number;
  paye_ttc: number;
  reste_a_facturer_ht: number;
  nb_brouillons: number;
};

export type DocumentProjet = { document_id: number; modele_id: number; etape_id: string | null; titre: string; par: string; par_nom: string; at: string; statut: "brouillon" | "signe" };
export type FactureResume = { id: number; numero: string | null; type: "facture" | "avoir"; statut: StatutFacture; objet: string; total_ttc: number; date_emission: string | null; date_echeance: string | null; etape_id: string };
export type ProjetDetail = Projet & { documents: DocumentProjet[]; factures: FactureResume[] };

export type Modele = { id: number; titre: string; categorie: string; contenu: string; actif: boolean; updated_by: string; updated_at: string };
export type Champ = { cle: string; libelle: string };
export type EtapeParcours = { phase: string; nom: string; description?: string; facturation: RegleFacturation; modeles: string[] };
export type Parcours = { provisoire?: boolean; etapes: EtapeParcours[] };
export type Identite = Record<string, string | number>;

export type LigneFacture = { designation: string; quantite: number; prix_unitaire_ht: number; taux_tva: number };
export type Facture = {
  id: number;
  numero: string | null;
  type: "facture" | "avoir";
  facture_origine_id: number | null;
  numero_origine: string | null;
  projet_id: number | null;
  projet_code: string | null;
  projet_nom: string | null;
  etape_id: string;
  client_nom: string;
  client_adresse: string;
  client_siren: string;
  objet: string;
  lignes: LigneFacture[];
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  statut: StatutFacture;
  date_emission: string | null;
  date_echeance: string | null;
  date_paiement: string | null;
  mode_paiement: string;
  notes: string;
  en_retard: boolean;
  avoir: { id: number; numero: string | null; statut: StatutFacture } | null;
  created_at: string;
  updated_at: string;
};
export type IndicateursFacturation = {
  brouillons: number;
  a_emettre_ttc: number;
  en_attente_ttc: number;
  en_retard_ttc: number;
  nb_en_retard: number;
  encaisse_annee_ttc: number;
  facture_annee_ht: number;
};

const json = (b: unknown) => ({ body: JSON.stringify(b) });

export const projets = {
  liste: () => req<Projet[]>("/api/projets"),
  lire: (id: number) => req<ProjetDetail>(`/api/projets/${id}`),
  creer: (b: Partial<Omit<Projet, "tiers">> & { tiers?: Partial<Projet["tiers"]> }) => req<ProjetDetail>("/api/projets", { method: "POST", ...json(b) }),
  modifier: (id: number, b: Partial<Omit<Projet, "etapes" | "tiers">> & { etapes?: Partial<Etape>[]; tiers?: Partial<Projet["tiers"]> }) =>
    req<ProjetDetail>(`/api/projets/${id}`, { method: "PUT", ...json(b) }),
  supprimer: (id: number) => req<{ ok: boolean }>(`/api/projets/${id}`, { method: "DELETE" }),
  statutEtape: (id: number, etapeId: string, statut: StatutEtape) =>
    req<ProjetDetail>(`/api/projets/${id}/etapes/${etapeId}/statut`, { method: "POST", ...json({ statut }) }),
  generer: (id: number, modele_id: number, etape_id?: string | null) =>
    req<{ document_id: number; projet: ProjetDetail }>(`/api/projets/${id}/documents`, { method: "POST", ...json({ modele_id, etape_id }) }),

  modeles: () => req<{ modeles: Modele[]; champs: Champ[] }>("/api/projets/modeles"),
  creerModele: (b: Partial<Modele>) => req<Modele>("/api/projets/modeles", { method: "POST", ...json(b) }),
  modifierModele: (id: number, b: Partial<Modele>) => req<Modele>(`/api/projets/modeles/${id}`, { method: "PUT", ...json(b) }),
  supprimerModele: (id: number) => req<{ ok: boolean }>(`/api/projets/modeles/${id}`, { method: "DELETE" }),

  parcours: () => req<Parcours>("/api/projets/parcours"),
  enregistrerParcours: (p: Parcours) => req<Parcours>("/api/projets/parcours", { method: "PUT", ...json(p) }),
  plansAction: () => req<PlansAction>("/api/projets/plans-action"),
  enregistrerPlansAction: (p: PlansAction) => req<PlansAction>("/api/projets/plans-action", { method: "PUT", ...json(p) }),
  identite: () => req<Identite>("/api/projets/identite"),
  enregistrerIdentite: (i: Identite) => req<Identite>("/api/projets/identite", { method: "PUT", ...json(i) }),
};

export const factures = {
  liste: () => req<{ factures: Facture[]; indicateurs: IndicateursFacturation }>("/api/factures"),
  lire: (id: number) => req<Facture>(`/api/factures/${id}`),
  creer: (b: Partial<Facture>) => req<Facture>("/api/factures", { method: "POST", ...json(b) }),
  modifier: (id: number, b: Partial<Facture>) => req<Facture>(`/api/factures/${id}`, { method: "PUT", ...json(b) }),
  supprimer: (id: number) => req<{ ok: boolean }>(`/api/factures/${id}`, { method: "DELETE" }),
  emettre: (id: number, date_emission?: string) => req<Facture>(`/api/factures/${id}/emettre`, { method: "POST", ...json({ date_emission: date_emission || null }) }),
  payer: (id: number, date_paiement: string, mode_paiement: string) =>
    req<Facture>(`/api/factures/${id}/payer`, { method: "POST", ...json({ date_paiement, mode_paiement }) }),
  avoir: (id: number) => req<Facture>(`/api/factures/${id}/avoir`, { method: "POST" }),
};

export type StatutAction = "a_lancer" | "en_cours" | "fait";
export type Action = { id: string; axe: string; titre: string; detail: string; statut: StatutAction; responsable: string; echeance: string | null };
export type AnneeFonciere = {
  annee: number;
  idf_projets: number;
  idf_logements: number;
  idf_detail: string;
  hors_idf_projets: number;
  hors_idf_logements: number;
};
export type PlansAction = { actions: Action[]; fonciere: { taux_fonds_propres: number; cout_moyen_logement: number; annees: AnneeFonciere[] } };
export const STATUT_ACTION: Record<StatutAction, string> = { a_lancer: "À lancer", en_cours: "En cours", fait: "Fait" };

export const PAYEURS: Record<Payeur, string> = { client: "Client ou bénéficiaire", collectivite: "Collectivité", promoteur: "Promoteur ou bailleur", financeur: "Financeur" };
export const BASES: Record<RegleFacturation["base"], string> = { honoraires: "des honoraires", ca_ttc: "du CA prévisionnel TTC" };

export const STATUT_ETAPE: Record<StatutEtape, string> = { a_venir: "À venir", en_cours: "En cours", terminee: "Terminée" };
export const STATUT_PROJET: Record<StatutProjet, string> = { en_cours: "En cours", termine: "Terminé", suspendu: "Suspendu", abandonne: "Abandonné" };
export const STATUT_FACTURE: Record<StatutFacture, string> = { brouillon: "Brouillon", emise: "Émise", payee: "Payée", annulee: "Annulée" };

/** Montant en euros avec séparateur de milliers lisible. */
export function euros(v: number, decimales = 0): string {
  return (
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v).replace(/ /g, " ") + " €"
  );
}

export function pourcent(v: number): string {
  return `${Math.round(v * 1000) / 10}`.replace(".", ",") + " %";
}

export function dateFr(d: string | null | undefined): string {
  if (!d) return "—";
  const [a, m, j] = d.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}
