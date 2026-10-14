"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Menage, QualificationResult, Typologie } from "@/lib/types";
import { formatEuro, formatPct } from "@/lib/format";
import { VerdictBadge } from "@/components/verdict-badge";
import { ImportModal } from "@/components/import-modal";
import { Upload } from "lucide-react";

type Row = { menage: Menage; qualification: QualificationResult | null };

export function CommercialisationClient({
  scenarioId,
  rows: initialRows,
}: {
  scenarioId: number;
  rows: Row[];
}) {
  const router = useRouter();
  const [rows] = useState<Row[]>(initialRows);
  const [selected, setSelected] = useState<Row | null>(initialRows[0] || null);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">
            M4 — Commercialisation BRS
          </div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Qualification des ménages</h1>
          <p className="text-sm text-ink-500 mt-1">
            Décile FiLoSoFi · Décote BRS · Subvention ANRU · Plan PTZ+PC · Taux d'effort · Reste à vivre
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="text-xs px-4 py-2 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-2"
          >
            <Upload size={13} /> Import Excel ménages
          </button>
          <a
            href={`/api/exports/commercialisation/${scenarioId}.xlsx`}
            className="text-xs px-4 py-2 bg-brand-500 text-white rounded-sm hover:bg-brand-700"
          >
            Export .xlsx
          </a>
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import batch de ménages (Excel)"
        description="Charger une liste de ménages depuis un fichier .xlsx. Colonnes attendues : reference, typologie, nb_personnes, nb_enfants, revenu_fiscal_annuel, apport, prestations_mensuelles."
        templateUrl="/api/imports/menages/template.xlsx"
        templateLabel="Télécharger le gabarit Excel"
        doImport={(f) => api.importMenagesExcel(scenarioId, f)}
        onSuccess={() => setTimeout(() => router.refresh(), 1500)}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6">
        {/* Table ménages */}
        <div className="col-span-12 xl:xl:col-span-8 col-span-12 rounded-sm border border-paper-200 bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-ink-500 bg-paper-50">
                <th className="text-left px-4 py-2 font-medium">Réf.</th>
                <th className="text-left px-4 py-2 font-medium">Typo</th>
                <th className="text-right px-4 py-2 font-medium">UC</th>
                <th className="text-right px-4 py-2 font-medium">Rev/UC</th>
                <th className="text-left px-4 py-2 font-medium">Décile</th>
                <th className="text-right px-4 py-2 font-medium">Mens.</th>
                <th className="text-right px-4 py-2 font-medium">Effort</th>
                <th className="text-left px-4 py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.menage.id}
                  onClick={() => setSelected(r)}
                  className={`border-t border-paper-200 cursor-pointer hover:bg-paper-50 ${
                    selected?.menage.id === r.menage.id ? "bg-brand-50/40" : ""
                  }`}
                >
                  <td className="px-4 py-2 font-mono text-xs text-ink-900">{r.menage.reference}</td>
                  <td className="px-4 py-2 text-ink-700">{r.menage.typologie_logement}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.qualification?.uc ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.qualification ? formatEuro(r.qualification.revenu_par_uc_annuel) : "—"}
                  </td>
                  <td className="px-4 py-2 text-ink-700">{r.qualification?.decile ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.qualification ? formatEuro(r.qualification.mensualite_totale) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.qualification ? formatPct(r.qualification.taux_effort_pct) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {r.qualification ? <VerdictBadge verdict={r.qualification.verdict} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-paper-200 p-3 text-xs text-ink-500">
            {rows.length} ménages · {rows.filter((r) => r.qualification?.verdict === "eligible").length} éligibles ·{" "}
            {rows.filter((r) => r.qualification?.verdict === "limite").length} limite ·{" "}
            {rows.filter((r) => r.qualification?.verdict === "non_eligible").length} non éligibles
          </div>
        </div>

        {/* Détail ménage sélectionné */}
        <div className="col-span-12 xl:col-span-4">
          {selected?.qualification ? (
            <MenageDetail row={selected} />
          ) : (
            <div className="rounded-sm border border-paper-200 bg-white p-6 text-sm text-ink-500 italic">
              Sélectionne un ménage pour voir le détail du calcul.
            </div>
          )}
        </div>
      </div>

      {/* Simulateur ad-hoc */}
      <div className="mt-10">
        <h2 className="font-serif text-2xl text-ink-900 mb-4">Test de qualification d’un ménage</h2>
        <PreviewForm />
      </div>
    </div>
  );
}

function MenageDetail({ row }: { row: Row }) {
  const q = row.qualification!;
  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-paper-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-ink-500">Ménage {q.reference}</div>
            <div className="font-serif text-lg text-ink-900">Logement {q.typologie}</div>
          </div>
          <VerdictBadge verdict={q.verdict} />
        </div>
        <ul className="text-xs text-ink-700 space-y-1">
          {q.motifs.map((m, i) => (
            <li key={i}>· {m}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
        <div className="px-4 py-2 bg-paper-50 text-[10px] uppercase tracking-widest text-ink-500 font-medium">
          Pipeline de calcul
        </div>
        <table className="w-full text-xs">
          <tbody>
            {q.etapes.map((e, i) => (
              <tr key={i} className="border-t border-paper-200">
                <td className="px-4 py-1.5 text-ink-700">{e.label}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-ink-900 font-medium">
                  {typeof e.valeur === "number"
                    ? e.unite === "€"
                      ? formatEuro(e.valeur)
                      : e.unite === "€/mois"
                      ? formatEuro(e.valeur)
                      : e.unite === "%"
                      ? formatPct(e.valeur)
                      : `${e.valeur} ${e.unite}`
                    : `${e.valeur}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewForm() {
  const [form, setForm] = useState({
    reference: "SIM-X",
    typologie_logement: "T3" as Typologie,
    adultes: 2,
    enfants_moins_14: 1,
    enfants_14_plus: 0,
    revenu_activites_annuel: 36000,
    revenus_patrimoine_annuel: 0,
    prestations_sociales_annuel: 4800,
    apport: 20000,
  });
  const [result, setResult] = useState<QualificationResult | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = () => {
    setErr(null);
    start(async () => {
      try {
        const r = await api.previewQualification({
          reference: form.reference,
          typologie_logement: form.typologie_logement,
          composition: {
            adultes: form.adultes,
            enfants_moins_14: form.enfants_moins_14,
            enfants_14_plus: form.enfants_14_plus,
          },
          revenu_activites_annuel: form.revenu_activites_annuel,
          revenus_patrimoine_annuel: form.revenus_patrimoine_annuel,
          prestations_sociales_annuel: form.prestations_sociales_annuel,
          apport: form.apport,
        });
        setResult(r);
      } catch (e) {
        setErr(String(e));
      }
    });
  };

  const field = (label: string, k: keyof typeof form, type: "number" | "text" = "number") => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-ink-500">{label}</span>
      <input
        type={type}
        value={form[k] as number | string}
        onChange={(e) =>
          setForm({ ...form, [k]: type === "number" ? Number(e.target.value) : e.target.value })
        }
        className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm text-sm focus:border-brand-500 focus:outline-none"
      />
    </label>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6">
      <div className="col-span-5 rounded-sm border border-paper-200 bg-white p-5">
        <div className="grid grid-cols-2 gap-3">
          {field("Référence", "reference", "text")}
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-500">Typologie</span>
            <select
              value={form.typologie_logement}
              onChange={(e) => setForm({ ...form, typologie_logement: e.target.value as Typologie })}
              className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm text-sm bg-white"
            >
              <option value="T2">T2</option>
              <option value="T3">T3</option>
              <option value="T4">T4</option>
            </select>
          </label>
          {field("Adultes", "adultes")}
          {field("Enfants < 14", "enfants_moins_14")}
          {field("Enfants ≥ 14", "enfants_14_plus")}
          {field("Revenus activités /an", "revenu_activites_annuel")}
          {field("Patrimoine /an", "revenus_patrimoine_annuel")}
          {field("Prestations CAF /an", "prestations_sociales_annuel")}
          {field("Apport", "apport")}
        </div>
        <button
          onClick={run}
          disabled={pending}
          className="mt-4 w-full px-4 py-2 bg-brand-500 text-white text-sm rounded-sm hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Calcul…" : "Simuler la qualification"}
        </button>
        {err && <div className="mt-3 text-xs text-danger-500">{err}</div>}
      </div>

      <div className="col-span-7">
        {result ? (
          <MenageDetail row={{ menage: {} as Menage, qualification: result }} />
        ) : (
          <div className="rounded-sm border border-paper-200 bg-paper-50 p-6 text-sm text-ink-500 italic">
            Remplis le formulaire et lance la simulation pour voir le résultat.
          </div>
        )}
      </div>
    </div>
  );
}
