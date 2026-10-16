"use client";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { FileDown, RefreshCw } from "lucide-react";

type AuditRow = {
  id: number;
  at: string;
  user: string;
  action: string;
  target_type: string;
  target_id: number | null;
  payload: Record<string, unknown> | null;
};
type AuditData = { rows: AuditRow[]; total: number; offset: number; limit: number };

const ACTION_COLORS: Record<string, string> = {
  calcul_bilan: "bg-brand-50 text-brand-700 border-brand-500/30",
  calcul_exploitation: "bg-brand-50 text-brand-700 border-brand-500/30",
  calcul_commercialisation: "bg-brand-50 text-brand-700 border-brand-500/30",
  export_bilan_xlsx: "bg-ok-50 text-ok-500 border-ok-500/30",
  export_exploitation_xlsx: "bg-ok-50 text-ok-500 border-ok-500/30",
  export_commercialisation_xlsx: "bg-ok-50 text-ok-500 border-ok-500/30",
  export_synthese_pdf: "bg-ok-50 text-ok-500 border-ok-500/30",
};

export function AuditClient({ initial, actions }: { initial: AuditData | null; actions: string[] }) {
  const [data, setData] = useState<AuditData | null>(initial);
  const [actionFilter, setAction] = useState<string>("");
  const [targetTypeFilter, setTargetType] = useState<string>("");
  const [sinceDays, setSinceDays] = useState<string>("");
  const [loading, start] = useTransition();

  const refresh = () => {
    start(async () => {
      const d = await api.listAudit({
        limit: 100,
        action: actionFilter || undefined,
        target_type: targetTypeFilter || undefined,
        since_days: sinceDays ? Number(sinceDays) : undefined,
      });
      setData(d);
    });
  };

  if (!data) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
        <div className="rounded-sm border border-paper-200 bg-white p-6 text-sm text-ink-500">
          Backend injoignable.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500">M7 — Journal d'audit</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Historique des opérations</h1>
          <p className="text-sm text-ink-500 mt-1">
            Traçabilité des calculs, modifications et exports — essentielle pour les financeurs et ANRU.
          </p>
        </div>
        <a
          href="/api/audit/export.csv"
          className="text-xs px-4 py-2 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-2"
        >
          <FileDown size={13} /> Export CSV complet
        </a>
      </div>

      {/* Filtres */}
      <div className="rounded-sm border border-paper-200 bg-white p-4 mb-6">
        <div className="grid grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-ink-500">Action</span>
            <select
              value={actionFilter}
              onChange={(e) => setAction(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm bg-white text-sm"
            >
              <option value="">Toutes</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-ink-500">Type cible</span>
            <select
              value={targetTypeFilter}
              onChange={(e) => setTargetType(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm bg-white text-sm"
            >
              <option value="">Tous</option>
              <option value="scenario">scenario</option>
              <option value="menage">menage</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-ink-500">Depuis N jours</span>
            <input
              type="number"
              placeholder="ex: 7"
              value={sinceDays}
              onChange={(e) => setSinceDays(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm text-sm"
            />
          </label>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-4 py-1.5 bg-brand-500 text-white text-sm rounded-sm hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 justify-center"
          >
            <RefreshCw size={13} /> {loading ? "Chargement…" : "Appliquer"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-4 py-2 font-medium">Horodatage UTC</th>
              <th className="text-left px-4 py-2 font-medium">Utilisateur</th>
              <th className="text-left px-4 py-2 font-medium">Action</th>
              <th className="text-left px-4 py-2 font-medium">Cible</th>
              <th className="text-left px-4 py-2 font-medium">Détail</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-500 italic text-xs">
                  Aucune entrée.
                </td>
              </tr>
            )}
            {data.rows.map((r) => {
              const color = ACTION_COLORS[r.action] || "bg-paper-100 text-ink-700 border-paper-200";
              return (
                <tr key={r.id} className="border-t border-paper-200 hover:bg-paper-50/50">
                  <td className="px-4 py-1.5 text-ink-500 text-xs tabular-nums font-mono">
                    {new Date(r.at).toISOString().replace("T", " ").split(".")[0]}
                  </td>
                  <td className="px-4 py-1.5 text-ink-700">{r.user}</td>
                  <td className="px-4 py-1.5">
                    <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-sm border ${color}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-ink-700 text-xs">
                    {r.target_type} <span className="font-mono text-ink-500">#{r.target_id}</span>
                  </td>
                  <td className="px-4 py-1.5 text-ink-500 text-xs font-mono">
                    {r.payload ? JSON.stringify(r.payload) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-paper-200 p-3 text-xs text-ink-500 flex items-center justify-between">
          <span>{data.rows.length} entrées affichées sur {data.total} total</span>
          <span>limite : {data.limit}</span>
        </div>
      </div>
    </div>
  );
}
