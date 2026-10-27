// « Ma journée » — page d'accueil personnelle.
import { req } from "./collab";
import type { TypeTache } from "./collab";

export type ElementAFaire =
  | {
      kind: "tache";
      id: number;
      type: TypeTache;
      titre: string;
      priorite: "normale" | "haute" | "urgente";
      echeance: string | null;
      en_retard: boolean;
      de: string;
      document_id: number | null;
      document_titre: string | null;
      operation_nom: string | null;
      url: string;
    }
  | {
      kind: "planning";
      id: number;
      type: "tache" | "jalon";
      titre: string;
      priorite: "normale";
      echeance: string;
      debut: string;
      en_retard: boolean;
      avancement: number;
      statut: string;
      operation_id: number;
      operation_nom: string | null;
      url: string;
    };

export type MaJourneeData = {
  utilisateur: { username: string; nom: string; role: string };
  date: string;
  compteurs: {
    taches: number;
    en_retard: number;
    a_signer: number;
    rdv_aujourdhui: number;
    jalons_30j: number;
    planning_assigne: number;
    envoyees_en_attente: number;
  };
  a_faire: ElementAFaire[];
  agenda: {
    id: number;
    titre: string;
    debut: string;
    fin: string | null;
    toute_journee: boolean;
    type_event: string;
    lieu: string;
    moi: boolean;
    operation_nom: string | null;
  }[];
  jalons: { id: number; titre: string; date: string; operation_id: number; operation_nom: string; url: string }[];
  operations: {
    id: number;
    nom: string;
    commune: string;
    nb_logements: number;
    avancement: number;
    en_retard: number;
    phase_en_cours: string | null;
    prochain_jalon: { titre: string; date: string } | null;
    alertes: { danger: number; warn: number };
    autofinancement_a1: number | null;
  }[];
  activite: { id: number; at: string; user: string; texte: string; url: string | null }[];
};

export const accueil = {
  charger: () => req<MaJourneeData>("/api/accueil"),
};
