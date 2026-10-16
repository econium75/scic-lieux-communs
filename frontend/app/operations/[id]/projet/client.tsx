"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Diamond, GanttChartSquare, KanbanSquare, ListChecks, Milestone, TriangleAlert, X } from "lucide-react";
import { fmtJour, projet, type Planning, type TacheP } from "@/lib/projet";
import { collab, type Membre } from "@/lib/collab";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { Gantt } from "@/components/projet/gantt";
import { Kanban } from "@/components/projet/kanban";
import { PhasesSuivi } from "@/components/projet/phases-suivi";
import { TacheProjetModal, type Brouillon } from "@/components/projet/tache-projet-modal";

type Vue = "gantt" | "tableau" | "phases";
const VUES: { k: Vue; l: string; icon: typeof GanttChartSquare }[] = [
  { k: "gantt", l: "Diagramme de Gantt", icon: GanttChartSquare },
  { k: "tableau", l: "Tableau", icon: KanbanSquare },
  { k: "phases", l: "Suivi des phases", icon: Milestone },
];

export function ProjetClient({ opId }: { opId: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const vueUrl = params.get("vue");
  const vue: Vue = vueUrl === "tableau" || vueUrl === "phases" ? vueUrl : "gantt";
  const tacheUrl = params.get("tache") ? Number(params.get("tache")) : null;
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [edition, setEdition] = useState<{ tache?: TacheP; brouillon?: Brouillon } | null>(null);
  const [cascade, setCascade] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [moi, setMoi] = useState<{ username: string; role: string } | null>(null);

  const recharger = useCallback(async () => {
    try {
      setPlanning(await projet.planning(opId));
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    }
  }, [opId]);

  useEffect(() => {
    const u = getUser();
    setMoi(u ? { username: u.username, role: u.role } : null);
    recharger();
    if (u) collab.annuaire().then(setMembres).catch(() => {});
  }, [recharger]);

  // Ouverture directe d'une tâche (lien de notification)
  useEffect(() => {
    if (!planning || !tacheUrl) return;
    const t = planning.taches.find((x) => x.id === tacheUrl);
    if (t) setEdition({ tache: t });
  }, [planning, tacheUrl]);

  const canEdit = moi?.role === "admin" || moi?.role === "saisie";
  const noms = useMemo(() => Object.fromEntries(membres.map((m) => [m.username, m.nom_affichage])), [membres]);
  const message = (ok: boolean, t: string) => setMsg({ ok, t });
  const changerVue = (v: Vue) => router.replace(`/operations/${opId}/projet?vue=${v}`, { scroll: false });
  const fermer = () => {
    setEdition(null);
    if (tacheUrl) router.replace(`/operations/${opId}/projet?vue=${vue}`, { scroll: false });
  };

  if (!planning)
    return <div className="px-6 py-10 text-sm text-ink-500">{msg ? <span className="text-danger-500">{msg.t}</span> : "Chargement du planning…"}</div>;
  const p = planning.projet;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1600px]">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500">Gestion de projet · {planning.operation.code}</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-0.5">{planning.operation.nom}</h1>
          <p className="text-xs text-ink-500 mt-1">
            {p.debut && p.fin ? `Du ${fmtJour(p.debut)} au ${fmtJour(p.fin)}` : "Aucune date planifiée"}
            {!canEdit && moi && " · lecture seule"}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Indic icon={ListChecks} l="Tâches" v={`${p.nb_terminees}/${p.nb_taches + p.nb_jalons}`} />
          <Indic icon={Clock} l="Avancement" v={`${p.avancement} %`} />
          <Indic icon={Diamond} l="Jalons" v={String(p.nb_jalons)} />
          <Indic icon={p.nb_en_retard ? TriangleAlert : CheckCircle2} l="En retard" v={String(p.nb_en_retard)} alerte={p.nb_en_retard > 0} />
        </div>
      </div>

      <nav className="flex gap-1 border-b border-paper-200 mb-4 overflow-x-auto">
        {VUES.map((v) => (
          <button
            key={v.k}
            onClick={() => changerVue(v.k)}
            className={cn("px-3 py-2 text-sm border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap", vue === v.k ? "border-brand-500 text-ink-900 font-medium" : "border-transparent text-ink-500 hover:text-ink-900")}
          >
            <v.icon size={14} /> {v.l}
          </button>
        ))}
      </nav>

      {msg && (
        <div className={cn("mb-3 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      {vue === "gantt" && (
        <Gantt
          planning={planning}
          canEdit={canEdit}
          cascade={cascade}
          setCascade={setCascade}
          noms={noms}
          moi={moi?.username ?? null}
          onOuvrir={(t) => setEdition({ tache: t })}
          onCreer={(b) => setEdition({ brouillon: b })}
          onRecharger={recharger}
          onMessage={message}
        />
      )}
      {vue === "tableau" && (
        <Kanban planning={planning} canEdit={canEdit} noms={noms} onOuvrir={(t) => setEdition({ tache: t })} onCreer={(b) => setEdition({ brouillon: b })} onRecharger={recharger} onMessage={message} />
      )}
      {vue === "phases" && <PhasesSuivi planning={planning} canEdit={canEdit} membres={membres} noms={noms} onRecharger={recharger} onMessage={message} />}

      {edition && (
        <TacheProjetModal
          planning={planning}
          tache={edition.tache}
          brouillon={edition.brouillon}
          cascade={cascade}
          canEdit={canEdit}
          onClose={fermer}
          onFait={async (t) => { fermer(); setMsg({ ok: true, t }); await recharger(); }}
        />
      )}
    </div>
  );
}

function Indic({ icon: I, l, v, alerte }: { icon: typeof Clock; l: string; v: string; alerte?: boolean }) {
  return (
    <div className={cn("rounded-sm border bg-white px-3 py-1.5 min-w-[96px]", alerte ? "border-danger-500/40" : "border-paper-200")}>
      <div className="text-[11px] uppercase tracking-widest text-ink-500 flex items-center gap-1"><I size={10} /> {l}</div>
      <div className={cn("font-serif text-lg", alerte ? "text-danger-500" : "text-ink-900")}>{v}</div>
    </div>
  );
}
