"use client";
import { useMemo, useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { aujourdHui, fmtJour, numeroter, projet, STATUTS, versJour, type Planning, type StatutProjet, type TacheP } from "@/lib/projet";
import { cn } from "@/lib/format";
import { Avatars } from "./avatars";
import type { Brouillon } from "./tache-projet-modal";

const COLONNES: StatutProjet[] = ["a_faire", "en_cours", "bloque", "termine"];

export function Kanban({
  planning,
  canEdit,
  noms,
  onOuvrir,
  onCreer,
  onRecharger,
  onMessage,
}: {
  planning: Planning;
  canEdit: boolean;
  noms: Record<string, string>;
  onOuvrir: (t: TacheP) => void;
  onCreer: (b: Brouillon) => void;
  onRecharger: () => Promise<void>;
  onMessage: (ok: boolean, t: string) => void;
}) {
  const [phase, setPhase] = useState<number | "">("");
  const [cible, setCible] = useState<StatutProjet | null>(null);
  const num = useMemo(() => numeroter(planning), [planning]);
  const nomsPhases = Object.fromEntries(planning.phases.map((p) => [p.id, p.nom]));
  const auj = aujourdHui();
  const taches = planning.taches.filter((t) => phase === "" || t.phase_id === phase);

  const deposer = async (id: number, statut: StatutProjet) => {
    setCible(null);
    const t = planning.taches.find((x) => x.id === id);
    if (!t || t.statut === statut) return;
    try {
      await projet.modifier(id, { statut });
      onMessage(true, `« ${t.titre} » → ${STATUTS[statut].l}${statut === "termine" ? " (100 %)" : ""}.`);
      await onRecharger();
    } catch (e) {
      onMessage(false, String((e as Error).message || e));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={phase} onChange={(e) => setPhase(e.target.value ? Number(e.target.value) : "")} className="text-xs px-2 py-1.5 border border-paper-200 rounded-sm bg-white">
          <option value="">Toutes les phases</option>
          {planning.phases.map((p) => <option key={p.id} value={p.id}>{num.get(`p${p.id}`)}. {p.nom}</option>)}
        </select>
        {canEdit && <span className="text-[11px] text-ink-500">Glissez une carte d'une colonne à l'autre pour changer son statut.</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {COLONNES.map((c) => {
          const cartes = taches.filter((t) => t.statut === c).sort((a, b) => a.fin.localeCompare(b.fin));
          return (
            <div
              key={c}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setCible(c); } }}
              onDragLeave={() => setCible(null)}
              onDrop={(e) => { e.preventDefault(); deposer(Number(e.dataTransfer.getData("text/plain")), c); }}
              className={cn("rounded-sm border bg-paper-50 min-h-[200px] flex flex-col transition", cible === c ? "border-brand-500 bg-brand-50/60" : "border-paper-200")}
            >
              <div className="px-3 py-2 border-b border-paper-200 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUTS[c].plein }} />
                <span className="text-sm font-medium text-ink-900">{STATUTS[c].l}</span>
                <span className="text-[11px] text-ink-500 ml-auto">{cartes.length}</span>
              </div>
              <div className="p-2 space-y-2 flex-1">
                {cartes.map((t) => {
                  const retard = t.statut !== "termine" && versJour(t.fin) < auj;
                  return (
                    <div
                      key={t.id}
                      draggable={canEdit}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.id))}
                      onClick={() => onOuvrir(t)}
                      className={cn("rounded-sm border bg-white p-2.5 shadow-sm hover:border-brand-500 cursor-pointer", retard ? "border-danger-500/60" : "border-paper-200")}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] text-ink-500 mt-0.5 shrink-0">{num.get(`t${t.id}`)}</span>
                        <span className="text-sm text-ink-900 leading-snug flex-1">{t.type === "jalon" && <span className="text-fuchsia-600 mr-1">◆</span>}{t.titre}</span>
                      </div>
                      {t.phase_id && <div className="text-[10px] uppercase tracking-widest text-ink-500 mt-1">{nomsPhases[t.phase_id]}</div>}
                      {t.type === "tache" && (
                        <div className="h-1.5 rounded-full bg-paper-100 mt-2 overflow-hidden">
                          <div className="h-full" style={{ width: `${t.avancement}%`, background: STATUTS[t.statut].plein }} />
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className={cn("text-[11px] inline-flex items-center gap-1", retard ? "text-danger-500 font-medium" : "text-ink-500")}>
                          <CalendarDays size={11} /> {t.type === "jalon" ? fmtJour(t.debut) : `${fmtJour(t.debut)} → ${fmtJour(t.fin)}`}
                        </span>
                        <Avatars users={t.assignes} noms={noms} taille={20} />
                      </div>
                    </div>
                  );
                })}
                {canEdit && c === "a_faire" && (
                  <button onClick={() => onCreer({ phase_id: phase === "" ? planning.phases[0]?.id ?? null : phase, type: "tache" })} className="w-full text-xs text-brand-500 hover:bg-white rounded-sm py-1.5 inline-flex items-center justify-center gap-1">
                    <Plus size={12} /> Ajouter une tâche
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
