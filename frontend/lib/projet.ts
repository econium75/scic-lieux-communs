// Suivi des opérations : planning (Gantt), phases de suivi.
import { req } from "./collab";

export type StatutProjet = "a_faire" | "en_cours" | "termine" | "bloque";
export type TacheP = {
  id: number;
  operation_id: number;
  phase_id: number | null;
  parent_id: number | null;
  type: "tache" | "jalon";
  titre: string;
  debut: string; // AAAA-MM-JJ
  fin: string;
  avancement: number;
  statut: StatutProjet;
  assignes: string[];
  dependances: number[];
  ordre: number;
  notes: string;
  cree_par: string;
};
export type PhaseP = {
  id: number;
  operation_id: number;
  ordre: number;
  nom: string;
  statut: StatutProjet;
  date_debut: string | null;
  date_cible: string | null;
  date_realisation: string | null;
  responsable: string;
  notes: string;
  debut: string | null;
  fin: string | null;
  avancement: number;
  nb_taches: number;
  planifiee_par_taches: boolean;
};
export type Planning = {
  operation: { id: number; nom: string; code: string };
  phases: PhaseP[];
  taches: TacheP[];
  projet: {
    debut: string | null;
    fin: string | null;
    avancement: number;
    nb_taches: number;
    nb_jalons: number;
    nb_terminees: number;
    nb_en_retard: number;
  };
};
export type TacheBody = Partial<Omit<TacheP, "id" | "ordre" | "cree_par">> & { cascade?: boolean };

export const STATUTS: Record<StatutProjet, { l: string; fond: string; plein: string }> = {
  a_faire: { l: "À faire", fond: "#cbd5e1", plein: "#94a3b8" },
  en_cours: { l: "En cours", fond: "#fcd34d", plein: "#d97706" },
  termine: { l: "Terminé", fond: "#5eead4", plein: "#0f766e" },
  bloque: { l: "Bloqué", fond: "#fca5a5", plein: "#dc2626" },
};

export const projet = {
  planning: (opId: number) => req<Planning>(`/api/projet/operation/${opId}`),
  creer: (b: TacheBody & { operation_id: number }) =>
    req<{ tache: TacheP; decalees: number[] }>("/api/projet/taches", { method: "POST", body: JSON.stringify(b) }),
  modifier: (id: number, b: TacheBody) =>
    req<{ tache: TacheP; decalees: number[] }>(`/api/projet/taches/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  supprimer: (id: number) => req<{ ok: boolean; supprimees: number }>(`/api/projet/taches/${id}`, { method: "DELETE" }),
  decalerPhase: (opId: number, phase_id: number, jours: number, cascade: boolean) =>
    req<{ ok: boolean }>(`/api/projet/operation/${opId}/decaler-phase`, { method: "POST", body: JSON.stringify({ phase_id, jours, cascade }) }),
  majPhase: (id: number, b: Partial<Pick<PhaseP, "statut" | "responsable" | "notes" | "nom">> & { date_debut?: string | null; date_cible?: string | null; date_realisation?: string | null }) =>
    req<PhaseP>(`/api/phases/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  initPhases: (opId: number) => req<PhaseP[]>(`/api/phases/operation/${opId}/init`, { method: "POST" }),
};

// ─── Dates en jours entiers (UTC) : aucune dérive de fuseau horaire
const J = 86_400_000;
export const versJour = (iso: string): number => {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(a, m - 1, j) / J);
};
export const versIso = (n: number): string => new Date(n * J).toISOString().slice(0, 10);
export const aujourdHui = (): number => {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / J);
};
export const jourDate = (n: number): Date => new Date(n * J);
export const fmtJour = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}.${m}.${a}`;
};

/** Numérotation hiérarchique (1, 1.2, 1.2.1) des phases et tâches, dans l'ordre d'affichage. */
export function numeroter(p: Planning): Map<string, string> {
  const num = new Map<string, string>();
  const groupes: (PhaseP | null)[] = [...p.phases, ...(p.taches.some((t) => !t.phase_id) ? [null] : [])];
  groupes.forEach((ph, i) => {
    num.set(ph ? `p${ph.id}` : "p0", String(i + 1));
    tachesDe(p.taches, ph ? ph.id : null).forEach((t, j) => {
      num.set(`t${t.id}`, `${i + 1}.${j + 1}`);
      sousTaches(p.taches, t.id).forEach((s, k) => num.set(`t${s.id}`, `${i + 1}.${j + 1}.${k + 1}`));
    });
  });
  return num;
}

const tri = (a: TacheP, b: TacheP) => a.debut.localeCompare(b.debut) || a.ordre - b.ordre || a.id - b.id;
export const tachesDe = (taches: TacheP[], phaseId: number | null) =>
  taches.filter((t) => (t.phase_id ?? null) === phaseId && !t.parent_id).sort(tri);
export const sousTaches = (taches: TacheP[], parentId: number) => taches.filter((t) => t.parent_id === parentId).sort(tri);

export function couleurAvatar(u: string): string {
  const palette = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  let h = 0;
  for (const c of u) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
