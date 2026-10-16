import { api } from "@/lib/api";
import { FileDown, FileSpreadsheet, FileText, Archive } from "lucide-react";

export default async function DonneesExportsPage() {
  let operations: Awaited<ReturnType<typeof api.listOperations>> = [];
  try {
    operations = await api.listOperations();
  } catch {}

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-5xl">
      <div className="text-[11px] uppercase tracking-widest text-ink-500">M6 — Restitutions</div>
      <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1 mb-2">Données & exports</h1>
      <p className="text-sm text-ink-500 mb-6">
        Génération à la volée des gabarits Excel formatés et des PDF de synthèse pour comité d'engagement.
      </p>

      {operations.length === 0 ? (
        <div className="rounded-sm border border-paper-200 bg-white p-6 text-sm text-ink-500 italic">
          Aucune opération.
        </div>
      ) : (
        <div className="space-y-6">
          {await Promise.all(
            operations.map(async (op) => {
              let scenarios: Awaited<ReturnType<typeof api.listScenarios>> = [];
              try {
                scenarios = await api.listScenarios(op.id);
              } catch {}
              return (
                <section key={op.id} className="rounded-sm border border-paper-200 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-paper-200 flex items-start justify-between">
                    <div>
                      <h2 className="font-serif text-lg text-ink-900">{op.nom}</h2>
                      <div className="text-xs text-ink-500">
                        {op.commune} · {op.nb_logements_total} logements · Livraison {op.livraison_cible}
                      </div>
                    </div>
                    <a
                      href={`/api/exports/operation/${op.id}.zip`}
                      className="text-xs px-3 py-1.5 bg-brand-700 text-white rounded-sm hover:bg-brand-900 flex items-center gap-2"
                    >
                      <Archive size={13} /> Export ZIP complet
                    </a>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-widest text-ink-500 bg-paper-50">
                        <th className="text-left px-5 py-2 font-medium">Scénario</th>
                        <th className="text-left px-5 py-2 font-medium">M2 Bilan</th>
                        <th className="text-left px-5 py-2 font-medium">M3 Exploitation</th>
                        <th className="text-left px-5 py-2 font-medium">M4 Commercialisation</th>
                        <th className="text-left px-5 py-2 font-medium">PDF Synthèse</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenarios.map((s) => (
                        <tr key={s.id} className="border-t border-paper-200">
                          <td className="px-5 py-2 text-ink-900">
                            {s.nom}
                            {s.is_reference && <span className="text-[11px] text-ink-500 ml-2 italic">(référence)</span>}
                          </td>
                          <td className="px-5 py-2">
                            <ExportLink href={`/api/exports/bilan/${s.id}.xlsx`} icon="xlsx" label="Bilan" />
                          </td>
                          <td className="px-5 py-2">
                            <ExportLink href={`/api/exports/exploitation/${s.id}.xlsx`} icon="xlsx" label="Exploitation" />
                          </td>
                          <td className="px-5 py-2">
                            <ExportLink href={`/api/exports/commercialisation/${s.id}.xlsx`} icon="xlsx" label="Commerc." />
                          </td>
                          <td className="px-5 py-2">
                            <ExportLink href={`/api/exports/synthese/${s.id}.pdf`} icon="pdf" label="Synthèse" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })
          )}
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div className="rounded-sm border border-paper-200 bg-paper-50 p-5">
          <h3 className="text-sm font-medium text-ink-900 mb-2">Formats d'export</h3>
          <ul className="text-sm text-ink-700 space-y-1">
            <li><strong>Bilan M2 .xlsx</strong> — 3 colonnes BRS/PLI/Total avec sous-totaux</li>
            <li><strong>Exploitation M3 .xlsx</strong> — compte 40 ans + plan de financement</li>
            <li><strong>Commercialisation M4 .xlsx</strong> — table ménages avec verdicts</li>
            <li><strong>Synthèse .pdf</strong> — 1 page A4 pour comité d'engagement</li>
            <li><strong>ZIP opération</strong> — tous les Excel + PDF + pièces jointes</li>
            <li><strong>Journal d'audit .csv</strong> — <a href="/api/audit/export.csv" className="text-brand-500 hover:underline">télécharger</a></li>
          </ul>
        </div>
        <div className="rounded-sm border border-paper-200 bg-paper-50 p-5">
          <h3 className="text-sm font-medium text-ink-900 mb-2">Imports disponibles</h3>
          <ul className="text-sm text-ink-700 space-y-1">
            <li><strong>Ménages Excel</strong> — depuis la page Commercialisation BRS</li>
            <li><strong>Bilan M2 Excel</strong> — depuis la page Scénarios d'une opération</li>
            <li><strong>Événements .ics</strong> — depuis la page Agenda</li>
            <li><strong>Référentiels Excel</strong> — depuis la page Paramètres</li>
            <li><strong>Pièces jointes</strong> — sur chaque opération (bouton Ajouter)</li>
            <li className="text-xs text-ink-500 italic">Tous les imports génèrent une entrée dans le journal d'audit (M7).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ExportLink({ href, icon, label }: { href: string; icon: "xlsx" | "pdf"; label: string }) {
  const Icon = icon === "xlsx" ? FileSpreadsheet : FileText;
  const color = icon === "xlsx" ? "text-ok-500 hover:bg-ok-50" : "text-danger-500 hover:bg-danger-50";
  return (
    <a href={href} className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm ${color}`}>
      <Icon size={13} /> {label}
    </a>
  );
}
