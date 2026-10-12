"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatEuro, formatPct } from "@/lib/format";
import { SensibiliteChart } from "./chart";

type Params = Record<string, { label: string; cible: string; default_range: [number, number]; step: number }>;
type Row = {
  value: number;
  marge_nette: number;
  marge_nette_pct: number;
  marge_brute: number;
  prix_revient: number;
  loyer_equilibre_m2_mois: number | null;
  caf_annee_1: number | null;
  cumul_tresorerie_fin: number | null;
};
type Result = {
  scenario_id: number;
  param: string;
  param_label: string;
  values: number[];
  rows: Row[];
};

export function SensibiliteClient({
  opId,
  scenarioId,
  scenarioNom,
  sensibiliteParams,
}: {
  opId: number;
  scenarioId: number;
  scenarioNom: string;
  sensibiliteParams: Params;
}) {
  const paramKeys = Object.keys(sensibiliteParams);
  const [selected, setSelected] = useState(paramKeys[0] || "");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (param: string) => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.sensibilite(scenarioId, param);
      setResult(r);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selected) run(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">M5 — Analyse de sensibilité</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Impact d'un paramètre sur les KPIs</h1>
          <p className="text-sm text-ink-500 mt-1">
            Scénario de base : <strong>{scenarioNom}</strong> · Les variations ne modifient pas le scénario stocké.
          </p>
        </div>
      </div>

      {/* Sélecteur */}
      <div className="rounded-sm border border-paper-200 bg-white p-5 mb-6">
        <div className="text-[10px] uppercase tracking-widest text-ink-500 mb-3">Paramètre à faire varier</div>
        <div className="grid grid-cols-5 gap-2">
          {paramKeys.map((k) => (
            <button
              key={k}
              onClick={() => setSelected(k)}
              className={`px-3 py-2 text-xs rounded-sm border transition ${
                selected === k
                  ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                  : "border-paper-200 bg-white text-ink-700 hover:border-ink-300"
              }`}
            >
              <div>{sensibiliteParams[k].label}</div>
              <div className="text-[10px] text-ink-500 mt-1">
                {sensibiliteParams[k].default_range[0]} → {sensibiliteParams[k].default_range[1]}
              </div>
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="rounded-sm border border-paper-200 bg-white p-6 text-sm text-ink-500 italic">
          Calcul en cours…
        </div>
      )}
      {err && (
        <div className="rounded-sm border border-danger-500/30 bg-danger-50 p-6 text-sm text-ink-700">
          Erreur : {err}
        </div>
      )}

      {result && (
        <>
          {/* Chart */}
          <div className="rounded-sm border border-paper-200 bg-white p-5 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-ink-500 mb-4">
              Impact sur marge nette & loyer d'équilibre
            </div>
            <SensibiliteChart rows={result.rows} paramLabel={result.param_label} />
          </div>

          {/* Table */}
          <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-ink-500 bg-paper-50">
                  <th className="text-left px-4 py-2 font-medium">Valeur</th>
                  <th className="text-right px-4 py-2 font-medium">Prix revient</th>
                  <th className="text-right px-4 py-2 font-medium">Marge brute</th>
                  <th className="text-right px-4 py-2 font-medium">Marge nette</th>
                  <th className="text-right px-4 py-2 font-medium">Marge %</th>
                  <th className="text-right px-4 py-2 font-medium">Loyer éq. €/m²</th>
                  <th className="text-right px-4 py-2 font-medium">CAF an.1</th>
                  <th className="text-right px-4 py-2 font-medium">Cumul trésor. fin</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className="border-t border-paper-200 hover:bg-paper-50">
                    <td className="px-4 py-1.5 text-ink-900 font-medium tabular-nums">{r.value}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{formatEuro(r.prix_revient, { compact: true })}</td>
                    <td className={`px-4 py-1.5 text-right tabular-nums ${r.marge_brute < 0 ? "text-danger-500" : ""}`}>
                      {formatEuro(r.marge_brute, { compact: true })}
                    </td>
                    <td className={`px-4 py-1.5 text-right tabular-nums font-medium ${r.marge_nette < 0 ? "text-danger-500" : r.marge_nette_pct < 3 ? "text-warn-500" : "text-ok-500"}`}>
                      {formatEuro(r.marge_nette, { compact: true })}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-ink-500">{formatPct(r.marge_nette_pct)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {r.loyer_equilibre_m2_mois !== null ? `${r.loyer_equilibre_m2_mois.toString().replace(".", ",")} €` : "—"}
                    </td>
                    <td className={`px-4 py-1.5 text-right tabular-nums ${r.caf_annee_1 !== null && r.caf_annee_1 < 0 ? "text-danger-500" : ""}`}>
                      {r.caf_annee_1 !== null ? formatEuro(r.caf_annee_1, { compact: true }) : "—"}
                    </td>
                    <td className={`px-4 py-1.5 text-right tabular-nums ${r.cumul_tresorerie_fin !== null && r.cumul_tresorerie_fin < 0 ? "text-danger-500" : ""}`}>
                      {r.cumul_tresorerie_fin !== null ? formatEuro(r.cumul_tresorerie_fin, { compact: true }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
