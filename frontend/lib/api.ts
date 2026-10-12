import type {
  Operation,
  Scenario,
  BilanResult,
  Menage,
  QualificationResult,
  QualificationPreviewPayload,
  ExploitationResult,
} from "./types";

const API_BASE =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    : ""; // client : relatif (rewritten par next.config.mjs)

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("scic_token");
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, {
    cache: "no-store",
    ...init,
    headers,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} — ${txt}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Opérations
  listOperations: () => fetchJson<Operation[]>("/api/operations"),
  getOperation: (id: number) => fetchJson<Operation>(`/api/operations/${id}`),
  createOperation: (body: Partial<Operation>) =>
    fetchJson<Operation>("/api/operations", { method: "POST", body: JSON.stringify(body) }),
  updateOperation: (id: number, body: Partial<Operation>) =>
    fetchJson<Operation>(`/api/operations/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteOperation: (id: number) =>
    fetchJson<{ ok: boolean }>(`/api/operations/${id}`, { method: "DELETE" }),

  // Scenarios
  listScenarios: (opId: number) => fetchJson<Scenario[]>(`/api/operations/${opId}/scenarios`),
  getScenario: (id: number) => fetchJson<Scenario>(`/api/scenarios/${id}`),
  dupliquerScenario: (scId: number, nom: string) =>
    fetchJson<Scenario>(`/api/scenarios/${scId}/duplicate?nom=${encodeURIComponent(nom)}`, {
      method: "POST",
    }),
  deleteScenario: (scId: number) =>
    fetchJson<{ ok: boolean }>(`/api/scenarios/${scId}`, { method: "DELETE" }),
  updateHypotheses: (scId: number, hypotheses: Record<string, unknown>) =>
    fetchJson<Scenario>(`/api/scenarios/${scId}/hypotheses`, {
      method: "PUT",
      body: JSON.stringify(hypotheses),
    }),
  patchHypotheses: (scId: number, patch: Record<string, unknown>) =>
    fetchJson<Scenario>(`/api/scenarios/${scId}/hypotheses`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  // M5
  listSensibiliteParams: () =>
    fetchJson<Record<string, { label: string; cible: string; default_range: [number, number]; step: number }>>(
      `/api/scenarios/sensibilite/params`
    ),
  sensibilite: (scId: number, param: string, values?: number[]) =>
    fetchJson<{
      scenario_id: number;
      param: string;
      param_label: string;
      values: number[];
      rows: {
        value: number;
        marge_nette: number;
        marge_nette_pct: number;
        marge_brute: number;
        prix_revient: number;
        loyer_equilibre_m2_mois: number | null;
        caf_annee_1: number | null;
        cumul_tresorerie_fin: number | null;
      }[];
    }>(`/api/scenarios/${scId}/sensibilite`, {
      method: "POST",
      body: JSON.stringify({ param, values: values || [] }),
    }),
  compareScenarios: (ids: number[]) =>
    fetchJson<{
      scenarios: {
        scenario_id: number;
        nom: string;
        is_reference: boolean;
        bilan: BilanResult;
        exploitation: ExploitationResult | null;
      }[];
    }>(`/api/scenarios/compare`, {
      method: "POST",
      body: JSON.stringify({ scenario_ids: ids }),
    }),

  // M2
  calculerBilan: (scId: number) =>
    fetchJson<BilanResult>(`/api/calculs/bilan/${scId}`, { method: "POST" }),

  // M3
  calculerExploitation: (scId: number) =>
    fetchJson<ExploitationResult>(`/api/calculs/exploitation/${scId}`, { method: "POST" }),

  // M4
  listMenages: (scId: number) => fetchJson<Menage[]>(`/api/menages/scenario/${scId}`),
  getMenage: (id: number) => fetchJson<Menage>(`/api/menages/${id}`),
  updateMenage: (id: number, data: Partial<Menage>) =>
    fetchJson<Menage>(`/api/menages/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  calculerQualification: (menageId: number) =>
    fetchJson<QualificationResult>(`/api/calculs/commercialisation/${menageId}`, { method: "POST" }),
  previewQualification: (payload: QualificationPreviewPayload) =>
    fetchJson<QualificationResult>(`/api/calculs/commercialisation/preview`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // M1 Référentiels DB
  listReferentiels: () =>
    fetchJson<{ id: number; code: string; label: string; data: Record<string, unknown>; updated_at: string }[]>(
      `/api/referentiels`
    ),
  updateReferentiel: (code: string, data: Record<string, unknown>) =>
    fetchJson(`/api/referentiels/${code}`, { method: "PUT", body: JSON.stringify(data) }),
  // M7 Audit
  listAudit: (opts: { limit?: number; offset?: number; action?: string; target_type?: string; since_days?: number } = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    return fetchJson<{
      rows: { id: number; at: string; user: string; action: string; target_type: string; target_id: number | null; payload: Record<string, unknown> | null }[];
      total: number;
      offset: number;
      limit: number;
    }>(`/api/audit?${qs.toString()}`);
  },
  listAuditActions: () => fetchJson<{ actions: string[] }>(`/api/audit/actions`),

  // Users (admin)
  listUsers: () => fetchJson<{ id: number; username: string; email: string; role: string; nom_affichage: string; actif: boolean }[]>(`/api/users`),
  createUser: (body: { username: string; password: string; role: string; email?: string; nom_affichage?: string }) =>
    fetchJson(`/api/users`, { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: number, body: Record<string, unknown>) =>
    fetchJson(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteUser: (id: number) => fetchJson(`/api/users/${id}`, { method: "DELETE" }),

  // Phases
  listPhases: (operationId: number) =>
    fetchJson<{ id: number; operation_id: number; ordre: number; nom: string; statut: string; date_cible: string | null; date_realisation: string | null; responsable: string; notes: string }[]>(
      `/api/phases/operation/${operationId}`
    ),
  initPhases: (operationId: number) => fetchJson(`/api/phases/operation/${operationId}/init`, { method: "POST" }),
  updatePhase: (id: number, body: Record<string, unknown>) =>
    fetchJson(`/api/phases/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  // Agenda
  listEvents: (debut?: string, fin?: string, operation_id?: number) => {
    const qs = new URLSearchParams();
    if (debut) qs.append("debut", debut);
    if (fin) qs.append("fin", fin);
    if (operation_id !== undefined) qs.append("operation_id", String(operation_id));
    return fetchJson<{ id: number; titre: string; description: string; debut: string; fin: string | null; toute_journee: boolean; type_event: string; operation_id: number | null; organisateur: string; participants: string[]; lieu: string }[]>(
      `/api/agenda?${qs.toString()}`
    );
  },
  createEvent: (body: Record<string, unknown>) => fetchJson(`/api/agenda`, { method: "POST", body: JSON.stringify(body) }),
  updateEvent: (id: number, body: Record<string, unknown>) => fetchJson(`/api/agenda/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteEvent: (id: number) => fetchJson(`/api/agenda/${id}`, { method: "DELETE" }),

  // Notifications
  listNotifications: (unread_only = false, limit = 50) =>
    fetchJson<{ rows: { id: number; at: string; type_notif: string; titre: string; message: string; lue: boolean; url_action: string | null; emise_par: string }[]; unread_count: number }>(
      `/api/notifications?unread_only=${unread_only}&limit=${limit}`
    ),
  markNotifRead: (id: number) => fetchJson(`/api/notifications/${id}/read`, { method: "PUT" }),
  markAllNotifRead: () => fetchJson(`/api/notifications/mark-all-read`, { method: "PUT" }),

  // Briefing podcast
  generateBriefing: () =>
    fetchJson<{ id: number; titre: string; script_texte: string; audio_path: string | null; duree_estimee_sec: number; jour: string; lu: boolean }>(
      `/api/briefing/generer`,
      { method: "POST" }
    ),
  getBriefingToday: () =>
    fetchJson<{ id: number; titre: string; script_texte: string; audio_path: string | null; duree_estimee_sec: number; jour: string; lu: boolean } | null>(
      `/api/briefing/aujourd-hui`
    ),
  listBriefings: (limit = 14) =>
    fetchJson<{ id: number; titre: string; script_texte: string; audio_path: string | null; duree_estimee_sec: number; jour: string; lu: boolean }[]>(
      `/api/briefing/historique?limit=${limit}`
    ),

  // Attachments
  listAttachments: (parentType: string, parentId: number) =>
    fetchJson<{ id: number; parent_type: string; parent_id: number; filename: string; mimetype: string; size: number; description: string; uploaded_by: string; uploaded_at: string }[]>(
      `/api/attachments/${parentType}/${parentId}`
    ),
  uploadAttachment: async (parentType: string, parentId: number, file: File, description = "") => {
    const token = typeof window !== "undefined" ? localStorage.getItem("scic_token") : null;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("description", description);
    const res = await fetch(`/api/attachments/${parentType}/${parentId}`, {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  deleteAttachment: (id: number) => fetchJson(`/api/attachments/${id}`, { method: "DELETE" }),

  // Imports
  importMenagesExcel: async (scenarioId: number, file: File) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("scic_token") : null;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/imports/menages/scenario/${scenarioId}`, {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ ok: boolean; nb_crees: number; crees: string[]; erreurs: { ligne: number; erreur: string }[] }>;
  },
  importBilanExcel: async (operationId: number, file: File, nomScenario: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("scic_token") : null;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/imports/bilan/operation/${operationId}?nom_scenario=${encodeURIComponent(nomScenario)}`, {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  importIcs: async (file: File, operationId?: number) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("scic_token") : null;
    const fd = new FormData();
    fd.append("file", file);
    const qs = operationId ? `?operation_id=${operationId}` : "";
    const res = await fetch(`/api/imports/ics${qs}`, {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ ok: boolean; nb_crees: number; crees: string[] }>;
  },

  // Upload référentiel Excel
  uploadReferentielExcel: async (code: string, file: File) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("scic_token") : null;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/referentiels/${code}/upload`, {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
