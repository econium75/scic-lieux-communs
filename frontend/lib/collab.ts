// Tâches, porte-documents et annuaire — appels API authentifiés.
import { getToken } from "./auth";

export type TypeTache = "validation" | "consultation" | "signature" | "autre";
export type Tache = {
  id: number;
  type_tache: TypeTache;
  titre: string;
  description: string;
  emetteur: string;
  emetteur_nom: string;
  destinataire: string;
  destinataire_nom: string;
  groupe: string;
  statut: "a_faire" | "terminee" | "refusee" | "annulee";
  priorite: "normale" | "haute" | "urgente";
  echeance: string | null;
  operation_id: number | null;
  operation_nom: string | null;
  document_id: number | null;
  document_titre: string | null;
  document_est_pdf: boolean;
  reponse: string;
  commentaire_reponse: string;
  vue_at: string | null;
  terminee_at: string | null;
  created_at: string;
  en_retard: boolean;
  groupe_taches?: Tache[];
};
export type Compteurs = { a_faire: number; en_retard: number; a_signer: number; envoyees_en_attente: number };
export type Membre = { username: string; nom_affichage: string; role: string };

export type Doc = {
  id: number;
  titre: string;
  nom_fichier: string;
  mimetype: string;
  proprietaire: string;
  proprietaire_nom: string;
  dossier: string;
  description: string;
  operation_id: number | null;
  partage_avec: string[];
  version_courante: number;
  statut: "brouillon" | "signe";
  created_at: string;
  updated_at: string;
  acces: "proprietaire" | "partage";
  taille: number;
  nb_pages: number;
  est_pdf: boolean;
  tache_signature_id: number | null;
};
export type DocVersion = { id: number; numero: number; taille: number; sha256: string; nb_pages: number; auteur: string; commentaire: string; created_at: string };
export type DocSignature = { id: number; version_numero: number; signataire: string; nom_affichage: string; signed_at: string; sha256: string; pages: number[]; tache_id: number | null };
export type DocDetail = Doc & {
  versions: DocVersion[];
  signatures: DocSignature[];
  taches: (Tache & { destinataire_nom: string; emetteur_nom: string })[];
  peut_gerer: boolean;
};
export type PageInfo = { page: number; largeur: number; hauteur: number };
export type TypeAnnotation = "texte" | "signature" | "paraphe" | "date" | "coche" | "surlignage" | "masque";
export type Annotation = { page: number; type: TypeAnnotation; x: number; y: number; w: number; h: number; texte?: string; taille?: number; couleur?: string };

export const LIBELLES_TYPE: Record<TypeTache, string> = {
  validation: "Validation",
  consultation: "Consultation",
  signature: "Signature",
  autre: "Tâche",
};
export const LIBELLES_REPONSE: Record<string, string> = {
  validee: "Validée",
  refusee: "Refusée",
  consultee: "Consultée",
  signee: "Signée",
  faite: "Faite",
};

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function req<T>(url: string, init: RequestInit = {}, json = true): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { ...headers(json), ...(init.headers as Record<string, string>) } });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      detail = await res.text().catch(() => "");
    }
    if (res.status === 401) detail = "Session expirée : reconnectez-vous.";
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const body = (b: unknown) => ({ body: JSON.stringify(b) });

export const collab = {
  annuaire: () => req<Membre[]>("/api/users/annuaire"),

  // Tâches
  taches: (boite: "recues" | "envoyees" | "toutes", statut?: "a_faire" | "cloturees") =>
    req<Tache[]>(`/api/taches?boite=${boite}${statut ? `&statut=${statut}` : ""}`),
  compteurs: () => req<Compteurs>("/api/taches/compteurs"),
  tache: (id: number) => req<Tache>(`/api/taches/${id}`),
  creerTache: (b: {
    type_tache: TypeTache;
    titre: string;
    description: string;
    destinataires: string[];
    echeance: string | null;
    priorite: string;
    operation_id: number | null;
    document_id: number | null;
  }) => req<Tache[]>("/api/taches", { method: "POST", ...body(b) }),
  repondre: (id: number, reponse: string, commentaire: string) =>
    req<Tache>(`/api/taches/${id}/repondre`, { method: "POST", ...body({ reponse, commentaire }) }),
  relancer: (id: number) => req<{ ok: boolean }>(`/api/taches/${id}/relancer`, { method: "POST" }),
  annuler: (id: number) => req<{ ok: boolean }>(`/api/taches/${id}/annuler`, { method: "POST" }),

  // Porte-documents
  documents: (vue = "tous", dossier?: string) =>
    req<{ rows: Doc[]; dossiers: string[] }>(`/api/documents?vue=${vue}${dossier ? `&dossier=${encodeURIComponent(dossier)}` : ""}`),
  document: (id: number) => req<DocDetail>(`/api/documents/${id}`),
  importer: (file: File, meta: { titre?: string; dossier?: string; description?: string; operation_id?: number | null } = {}) => {
    const fd = new FormData();
    fd.append("file", file);
    if (meta.titre) fd.append("titre", meta.titre);
    fd.append("dossier", meta.dossier || "Général");
    if (meta.description) fd.append("description", meta.description);
    if (meta.operation_id) fd.append("operation_id", String(meta.operation_id));
    return req<Doc>("/api/documents", { method: "POST", body: fd }, false);
  },
  nouvelleVersion: (id: number, file: File, commentaire: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("commentaire", commentaire);
    return req<Doc>(`/api/documents/${id}/versions`, { method: "POST", body: fd }, false);
  },
  modifierDocument: (id: number, b: Partial<Pick<Doc, "titre" | "dossier" | "description" | "partage_avec">>) =>
    req<Doc>(`/api/documents/${id}`, { method: "PUT", ...body(b) }),
  supprimerDocument: (id: number) => req<{ ok: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),
  pages: (id: number, version: number) => req<PageInfo[]>(`/api/documents/${id}/versions/${version}/pages`),
  annoter: (id: number, b: { annotations: Annotation[]; pages_supprimees: number[]; rotations: Record<number, number>; commentaire: string; tache_id: number | null; version_base: number }) =>
    req<Doc & { version: number }>(`/api/documents/${id}/annoter`, { method: "POST", ...body(b) }),
  maSignature: () => req<{ image: string; paraphe: string; updated_at: string | null }>("/api/documents/ma-signature"),
  enregistrerSignature: (image: string, paraphe: string) =>
    req<{ ok: boolean }>("/api/documents/ma-signature", { method: "PUT", ...body({ image, paraphe }) }),
};

/** Récupère un fichier protégé et renvoie une URL locale (blob:) — à libérer avec URL.revokeObjectURL. */
export async function blobUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: headers(false) });
  if (!res.ok) throw new Error(res.status === 401 ? "Session expirée" : `Erreur ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** Télécharge un fichier protégé par authentification. */
export async function telecharger(url: string, nom: string): Promise<void> {
  const u = await blobUrl(url);
  const a = document.createElement("a");
  a.href = u;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

export function tailleLisible(o: number): string {
  if (o < 1024) return `${o} o`;
  if (o < 1024 * 1024) return `${(o / 1024).toFixed(0)} Ko`;
  return `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}
