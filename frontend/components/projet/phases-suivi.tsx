"use client";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Clock, Plus } from "lucide-react";
import { fmtJour, numeroter, projet, STATUTS, type PhaseP, type Planning, type StatutProjet } from "@/lib/projet";
import type { Membre } from "@/lib/collab";
import { cn } from "@/lib/format";
import { Avatars } from "./avatars";

const ICONES: Record<StatutProjet, typeof Circle> = { a_faire: Circle, en_cours: Clock, termine: CheckCircle2, bloque: AlertCircle };

export function PhasesSuivi({
  planning,
  canEdit,
  membres,
  noms,
  onRecharger,
  onMessage,
}: {
  planning: Planning;
  canEdit: boolean;
  membres: Membre[];
  noms: Record<string, string>;
  onRecharger: () => Promise<void>;
  onMessage: (ok: boolean, t: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const num = numeroter(planning);
  const phases = planning.phases;
  const terminees = phases.filter((p) => p.statut === "termine").length;

  const maj = async (p: PhaseP, b: Parameters<typeof projet.majPhase>[1], texte: string) => {
    setBusy(true);
    try {
      await projet.majPhase(p.id, b);
      onMessage(true, texte);
      await onRecharger();
    } catch (e) {
      onMessage(false, String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const initialiser = async () => {
    setBusy(true);
    try {
      await projet.initPhases(planning.operation.id);
      onMessage(true, "Les 8 phases standard ont été créées.");
      await onRecharger();
    } catch (e) {
      onMessage(false, String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!phases.length)
    return (
      <div className="rounded-sm border border-paper-200 bg-white p-8 text-center">
        <p className="text-sm text-ink-500 mb-3">Aucune phase définie pour cette opération.</p>
        {canEdit && (
          <button onClick={initialiser} disabled={busy} className="text-xs px-3 py-1.5 bg-brand-500 text-white rounded-sm hover:bg-brand-700 inline-flex items-center gap-1.5">
            <Plus size={12} /> Initialiser les 8 phases standard
          </button>
        )}
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Frise */}
      <div className="rounded-sm border border-paper-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] uppercase tracking-widest text-ink-500">Suivi de projet</div>
          <div className="text-xs text-ink-500">{terminees} / {phases.length} phases terminées · avancement global {planning.projet.avancement} %</div>
        </div>
        <div className="relative">
          <div className="absolute top-4 left-[6%] right-[6%] h-0.5 bg-paper-200" />
          <div className="relative grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(phases.length, 8)}, minmax(0, 1fr))` }}>
            {phases.map((p) => {
              const I = ICONES[p.statut] || Circle;
              return (
                <div key={p.id} className="flex flex-col items-center text-center">
                  <div className="h-8 w-8 rounded-full bg-white border-2 flex items-center justify-center" style={{ borderColor: STATUTS[p.statut].plein, color: STATUTS[p.statut].plein }}>
                    <I size={16} />
                  </div>
                  <div className="text-[11px] text-ink-900 mt-1 leading-tight">{p.nom}</div>
                  <div className="text-[11px] text-ink-500">{p.avancement} %</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tableau détaillé */}
      <div className="rounded-sm border border-paper-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper-50">
            <tr className="text-[11px] uppercase tracking-widest text-ink-500">
              {["N°", "Phase", "Statut", "Responsable", "Début", "Échéance", "Avancement", "Tâches", "Notes"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {phases.map((p) => (
              <tr key={p.id} className="border-t border-paper-200 align-top">
                <td className="px-3 py-2 text-ink-500">{num.get(`p${p.id}`)}</td>
                <td className="px-3 py-2 font-medium text-ink-900 whitespace-nowrap">{p.nom}</td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <select
                      value={p.statut}
                      disabled={busy}
                      onChange={(e) => maj(p, { statut: e.target.value as StatutProjet, date_realisation: e.target.value === "termine" ? new Date().toISOString() : undefined }, `Phase « ${p.nom} » : ${STATUTS[e.target.value as StatutProjet].l}.`)}
                      className="text-xs px-1.5 py-1 border border-paper-200 rounded-sm bg-white"
                    >
                      {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.l}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs">{STATUTS[p.statut].l}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <select
                      value={p.responsable || ""}
                      disabled={busy}
                      onChange={(e) => maj(p, { responsable: e.target.value }, `Responsable de « ${p.nom} » : ${noms[e.target.value] || "aucun"}.`)}
                      className="text-xs px-1.5 py-1 border border-paper-200 rounded-sm bg-white max-w-[160px]"
                    >
                      <option value="">—</option>
                      {membres.map((m) => <option key={m.username} value={m.username}>{m.nom_affichage}</option>)}
                    </select>
                  ) : p.responsable ? (
                    <Avatars users={[p.responsable]} noms={noms} />
                  ) : (
                    "—"
                  )}
                </td>
                {p.planifiee_par_taches || !canEdit ? (
                  <>
                    <td className="px-3 py-2 text-xs whitespace-nowrap" title={p.planifiee_par_taches ? "Calculé d'après les tâches de la phase" : undefined}>{fmtJour(p.debut)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap" title={p.planifiee_par_taches ? "Calculé d'après les tâches de la phase" : undefined}>{fmtJour(p.fin)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-1.5">
                      <input type="date" defaultValue={p.date_debut?.slice(0, 10) || ""} disabled={busy}
                        onBlur={(e) => e.target.value !== (p.date_debut?.slice(0, 10) || "") && maj(p, { date_debut: e.target.value || null }, `Début de « ${p.nom} » enregistré.`)}
                        className="text-xs px-1.5 py-1 border border-paper-200 rounded-sm" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="date" defaultValue={p.date_cible?.slice(0, 10) || ""} disabled={busy}
                        onBlur={(e) => e.target.value !== (p.date_cible?.slice(0, 10) || "") && maj(p, { date_cible: e.target.value || null }, `Échéance de « ${p.nom} » enregistrée.`)}
                        className="text-xs px-1.5 py-1 border border-paper-200 rounded-sm" />
                    </td>
                  </>
                )}
                <td className="px-3 py-2 min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-paper-100 overflow-hidden">
                      <div className="h-full" style={{ width: `${p.avancement}%`, background: STATUTS[p.statut].plein }} />
                    </div>
                    <span className="text-[11px] text-ink-500 w-8 text-right">{p.avancement} %</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-ink-500">{p.nb_taches}</td>
                <td className="px-3 py-1.5 min-w-[200px]">
                  {canEdit ? (
                    <textarea defaultValue={p.notes} disabled={busy} rows={1}
                      onBlur={(e) => e.target.value !== p.notes && maj(p, { notes: e.target.value }, `Notes de « ${p.nom} » enregistrées.`)}
                      className={cn("w-full text-xs px-1.5 py-1 border border-paper-200 rounded-sm resize-y")} />
                  ) : (
                    <span className="text-xs text-ink-700">{p.notes || "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-ink-500 border-t border-paper-200">
          Une phase qui contient des tâches prend les dates et l'avancement de ses tâches ; sinon, saisissez son début et son échéance ici
          ou glissez sa barre dans le diagramme de Gantt. Le responsable est notifié des changements de statut.
        </p>
      </div>
    </div>
  );
}
