"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { BilanResult, ExploitationResult, Scenario } from "@/lib/types";
import { formatEuro, formatPct } from "@/lib/format";
import { Copy, Trash2, GitCompare, Sliders, Upload } from "lucide-react";
import { ImportModal } from "@/components/import-modal";

type Row = {
  scenario: Scenario;
  bilan: BilanResult | null;
  exploit: ExploitationResult | null;
};
type SensibiliteParams = Record<string, { label: string; cible: string; default_range: [number, number]; step: number }>;

export function ScenariosClient({
  opId,
  rows,
  sensibiliteParams,
}: {
  opId: number;
  rows: Row[];
  sensibiliteParams: SensibiliteParams;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [nomScenario, setNomScenario] = useState("Scénario importé Excel");

  const toggleCompare = (id: number) => {
    setSelectedForCompare((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)
    );
  };

  const dupliquer = (scId: number, nom: string) => {
    start(async () => {
      await api.dupliquerScenario(scId, nom);
      router.refresh();
    });
  };

  const supprimer = (scId: number) => {
    if (!confirm("Supprimer ce scénario ?")) return;
    start(async () => {
      await api.deleteScenario(scId);
      router.refresh();
    });
  };

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">M5 — Scénarios & sensibilité</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Scénarios</h1>
          <p className="text-sm text-ink-500 mt-1">
            Variantes de simulation pour comité d'engagement — duplication, comparaison, sensibilité
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedForCompare.length === 2 && (
            <Link
              href={`/operations/${opId}/scenarios/compare?a=${selectedForCompare[0]}&b=${selectedForCompare[1]}`}
              className="text-xs px-4 py-2 bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-2"
            >
              <GitCompare size={13} /> Comparer les 2 sélectionnés
            </Link>
          )}
          <Link
            href={`/operations/${opId}/scenarios/sensibilite`}
            className="text-xs px-4 py-2 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-2"
          >
            <Sliders size={13} /> Analyse de sensibilité
          </Link>
          <button
            onClick={() => setImportOpen(true)}
            className="text-xs px-4 py-2 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-2"
          >
            <Upload size={13} /> Importer un bilan Excel
          </button>
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import bilan M2 depuis Excel"
        description="Charge un fichier .xls / .xlsx au format du Modèle de bilan.xls client (feuille RECAP ou BILAN) et crée un nouveau scénario."
        extraFields={
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-500">Nom du scénario à créer</span>
            <input
              type="text"
              value={nomScenario}
              onChange={(e) => setNomScenario(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm text-sm"
            />
          </label>
        }
        doImport={async (f) => {
          await api.importBilanExcel(opId, f, nomScenario);
          return { ok: true, nb_crees: 1 };
        }}
        onSuccess={() => setTimeout(() => window.location.reload(), 1500)}
      />

      <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-5 py-2 font-medium w-10"></th>
              <th className="text-left px-5 py-2 font-medium">Nom</th>
              <th className="text-left px-5 py-2 font-medium">Rôle</th>
              <th className="text-right px-5 py-2 font-medium">Prix revient</th>
              <th className="text-right px-5 py-2 font-medium">Marge brute</th>
              <th className="text-right px-5 py-2 font-medium">Marge nette</th>
              <th className="text-right px-5 py-2 font-medium">Loyer éq.</th>
              <th className="text-right px-5 py-2 font-medium">CAF an.1</th>
              <th className="text-right px-5 py-2 font-medium w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scenario.id} className="border-t border-paper-200 hover:bg-paper-50/50">
                <td className="px-5 py-2">
                  <input
                    type="checkbox"
                    checked={selectedForCompare.includes(r.scenario.id)}
                    onChange={() => toggleCompare(r.scenario.id)}
                    className="accent-brand-500"
                  />
                </td>
                <td className="px-5 py-2 text-ink-900 font-medium">{r.scenario.nom}</td>
                <td className="px-5 py-2 text-ink-500 text-xs">
                  {r.scenario.is_reference ? "Référence" : "Variante"}
                </td>
                <td className="px-5 py-2 text-right tabular-nums">
                  {r.bilan ? formatEuro(r.bilan.prix_revient_ht_total, { compact: true }) : "—"}
                </td>
                <td
                  className={`px-5 py-2 text-right tabular-nums ${
                    r.bilan && r.bilan.marge_brute_totale < 0 ? "text-danger-500" : ""
                  }`}
                >
                  {r.bilan ? formatEuro(r.bilan.marge_brute_totale, { compact: true }) : "—"}
                </td>
                <td
                  className={`px-5 py-2 text-right tabular-nums font-medium ${
                    r.bilan
                      ? r.bilan.marge_nette_totale < 0
                        ? "text-danger-500"
                        : r.bilan.marge_nette_pct < 3
                        ? "text-warn-500"
                        : "text-ok-500"
                      : ""
                  }`}
                >
                  {r.bilan ? (
                    <>
                      {formatEuro(r.bilan.marge_nette_totale, { compact: true })}{" "}
                      <span className="text-xs text-ink-500">({formatPct(r.bilan.marge_nette_pct)})</span>
                    </>
                  ) : "—"}
                </td>
                <td
                  className={`px-5 py-2 text-right tabular-nums ${
                    r.exploit && !r.exploit.conforme_plafond ? "text-danger-500" : ""
                  }`}
                >
                  {r.exploit
                    ? `${r.exploit.loyer_equilibre_m2_mois.toString().replace(".", ",")} €`
                    : "—"}
                </td>
                <td className={`px-5 py-2 text-right tabular-nums ${r.exploit && r.exploit.caf_annee_1 < 0 ? "text-danger-500" : ""}`}>
                  {r.exploit ? formatEuro(r.exploit.caf_annee_1, { compact: true }) : "—"}
                </td>
                <td className="px-5 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => dupliquer(r.scenario.id, `${r.scenario.nom} (copie)`)}
                      className="p-1.5 hover:bg-paper-100 rounded text-ink-500 hover:text-brand-500"
                      title="Dupliquer"
                    >
                      <Copy size={14} />
                    </button>
                    {!r.scenario.is_reference && (
                      <button
                        onClick={() => supprimer(r.scenario.id)}
                        className="p-1.5 hover:bg-paper-100 rounded text-ink-500 hover:text-danger-500"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-ink-500 italic text-xs">
                  Aucun scénario.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-paper-200 p-3 text-xs text-ink-500 flex items-center justify-between">
          <span>
            {rows.length} scénario{rows.length > 1 ? "s" : ""} · Coche 2 lignes pour comparer
          </span>
          <span>
            Variables de sensibilité disponibles : {Object.keys(sensibiliteParams).length}
          </span>
        </div>
      </div>
    </div>
  );
}
