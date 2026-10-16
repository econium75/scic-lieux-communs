"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import {
  aujourdHui, fmtJour, jourDate, numeroter, projet, sousTaches, STATUTS, tachesDe, versIso, versJour,
  type PhaseP, type Planning, type TacheP,
} from "@/lib/projet";
import { cn } from "@/lib/format";
import { Avatars, StatutPoint } from "./avatars";
import type { Brouillon } from "./tache-projet-modal";

type Zoom = "jour" | "semaine" | "mois";
const PPD: Record<Zoom, number> = { jour: 30, semaine: 14, mois: 4 };
const H = 36; // hauteur de ligne
const HE = 52; // hauteur de l'en-tête
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const COULEUR_JALON = "#c026d3";
const COULEUR_PHASE = { fond: "#f3d38b", plein: "#c48a12" };

type Ligne =
  | { kind: "projet"; key: string }
  | { kind: "phase"; key: string; phase: PhaseP | null; num: string; ouvert: boolean }
  | { kind: "tache"; key: string; t: TacheP; num: string; niveau: 1 | 2; aEnfants: boolean }
  | { kind: "ajout"; key: string; phaseId: number | null };

type Drag = { key: string; mode: "deplacer" | "debut" | "fin"; x0: number; d0: number; d1: number; ligne: Ligne; bouge: boolean };

function semaineIso(n: number): number {
  const d = jourDate(n);
  const jour = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - jour + 3);
  const premierJeudi = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - premierJeudi.getTime()) / 86_400_000 - 3 + ((premierJeudi.getUTCDay() + 6) % 7)) / 7);
}

export function Gantt({
  planning,
  canEdit,
  cascade,
  setCascade,
  noms,
  moi,
  onOuvrir,
  onCreer,
  onRecharger,
  onMessage,
}: {
  planning: Planning;
  canEdit: boolean;
  cascade: boolean;
  setCascade: (v: boolean) => void;
  noms: Record<string, string>;
  moi: string | null;
  onOuvrir: (t: TacheP) => void;
  onCreer: (b: Brouillon) => void;
  onRecharger: () => Promise<void>;
  onMessage: (ok: boolean, t: string) => void;
}) {
  const [zoom, setZoom] = useState<Zoom>("semaine");
  const [replies, setReplies] = useState<Set<string>>(new Set());
  const [gauche, setGauche] = useState(true);
  const [etroit, setEtroit] = useState(false);
  const [mesTaches, setMesTaches] = useState(false);
  const [apercu, setApercu] = useState<Record<string, { d0: number; d1: number }>>({});
  const [survol, setSurvol] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const ppd = PPD[zoom];

  useEffect(() => {
    const maj = () => setEtroit(window.innerWidth < 768);
    maj();
    window.addEventListener("resize", maj);
    return () => window.removeEventListener("resize", maj);
  }, []);
  const L = !gauche ? 0 : etroit ? 190 : 470;

  const num = useMemo(() => numeroter(planning), [planning]);

  // ── Lignes affichées
  const lignes = useMemo(() => {
    const out: Ligne[] = [{ kind: "projet", key: "projet" }];
    const visible = (t: TacheP) =>
      !mesTaches || !moi || t.assignes.includes(moi) || sousTaches(planning.taches, t.id).some((s) => s.assignes.includes(moi));
    const groupes: (PhaseP | null)[] = [...planning.phases, ...(planning.taches.some((t) => !t.phase_id) ? [null] : [])];
    for (const ph of groupes) {
      const key = ph ? `p${ph.id}` : "p0";
      const ouvert = !replies.has(key);
      out.push({ kind: "phase", key, phase: ph, num: num.get(key) || "", ouvert });
      if (!ouvert) continue;
      for (const t of tachesDe(planning.taches, ph ? ph.id : null)) {
        if (!visible(t)) continue;
        const enfants = sousTaches(planning.taches, t.id);
        out.push({ kind: "tache", key: `t${t.id}`, t, num: num.get(`t${t.id}`) || "", niveau: 1, aEnfants: enfants.length > 0 });
        if (replies.has(`t${t.id}`)) continue;
        for (const s of enfants) {
          if (mesTaches && moi && !s.assignes.includes(moi)) continue;
          out.push({ kind: "tache", key: `t${s.id}`, t: s, num: num.get(`t${s.id}`) || "", niveau: 2, aEnfants: false });
        }
      }
      if (canEdit) out.push({ kind: "ajout", key: `a${key}`, phaseId: ph ? ph.id : null });
    }
    return out;
  }, [planning, replies, num, canEdit, mesTaches, moi]);

  // ── Dates d'une ligne (avec l'aperçu de glisser-déposer)
  const bornes = (l: Ligne): [number, number] | null => {
    const ap = apercu[l.key];
    if (ap) return [ap.d0, ap.d1];
    if (l.kind === "tache") return [versJour(l.t.debut), versJour(l.t.fin)];
    if (l.kind === "phase" && l.phase?.debut && l.phase.fin) return [versJour(l.phase.debut), versJour(l.phase.fin)];
    if (l.kind === "phase" && !l.phase) {
      const ts = planning.taches.filter((t) => !t.phase_id);
      if (!ts.length) return null;
      return [Math.min(...ts.map((t) => versJour(t.debut))), Math.max(...ts.map((t) => versJour(t.fin)))];
    }
    if (l.kind === "projet" && planning.projet.debut && planning.projet.fin) return [versJour(planning.projet.debut), versJour(planning.projet.fin)];
    return null;
  };

  // ── Fenêtre de temps
  const auj = aujourdHui();
  const { debut, fin } = useMemo(() => {
    const ds = [
      ...planning.taches.flatMap((t) => [versJour(t.debut), versJour(t.fin)]),
      ...planning.phases.flatMap((p) => [p.debut, p.fin].filter(Boolean).map((x) => versJour(x as string))),
    ];
    let d0 = ds.length ? Math.min(...ds) : auj - 14;
    let d1 = ds.length ? Math.max(...ds) : auj + 90;
    d0 -= 10;
    d1 += 30;
    if (zoom === "mois") {
      const d = jourDate(d0);
      d0 = versJour(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
    } else {
      d0 -= (jourDate(d0).getUTCDay() + 6) % 7; // lundi
    }
    return { debut: d0, fin: d1 };
  }, [planning, zoom, auj]);
  const W = (fin - debut + 1) * ppd;
  const x = (n: number) => (n - debut) * ppd;

  // ── Graduations
  const { haut, bas, weekends } = useMemo(() => {
    const haut: { l: number; w: number; t: string }[] = [];
    const bas: { l: number; w: number; t: string; s?: string; we?: boolean }[] = [];
    const weekends: number[] = [];
    let cle = "";
    for (let n = debut; n <= fin; n++) {
      const d = jourDate(n);
      const k = zoom === "mois" ? String(d.getUTCFullYear()) : `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (k !== cle) {
        haut.push({ l: x(n), w: 0, t: zoom === "mois" ? String(d.getUTCFullYear()) : `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
        cle = k;
      }
      haut[haut.length - 1].w += ppd;
      const we = d.getUTCDay() === 0 || d.getUTCDay() === 6;
      if (we && zoom === "jour") weekends.push(n);
      if (zoom === "jour") bas.push({ l: x(n), w: ppd, t: String(d.getUTCDate()), we });
      else if (zoom === "semaine" && (d.getUTCDay() + 6) % 7 === 0) {
        const f = jourDate(n + 6);
        bas.push({ l: x(n), w: 7 * ppd, t: `${d.getUTCDate()}-${f.getUTCDate()}`, s: `S${semaineIso(n)}` });
      } else if (zoom === "mois" && d.getUTCDate() === 1) {
        const jours = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        bas.push({ l: x(n), w: jours * ppd, t: MOIS[d.getUTCMonth()] });
      }
    }
    return { haut, bas, weekends };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debut, fin, zoom, ppd]);

  // Centrage initial sur aujourd'hui
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, x(Math.min(Math.max(auj, debut), fin)) - 260);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, debut]);
  const allerAujourdhui = () => scrollRef.current?.scrollTo({ left: Math.max(0, x(auj) - 260), behavior: "smooth" });

  // ── Glisser-déposer
  const demarrer = (e: React.PointerEvent, ligne: Ligne, mode: Drag["mode"]) => {
    const b = bornes(ligne);
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    if (!canEdit) {
      if (ligne.kind === "tache") onOuvrir(ligne.t);
      return;
    }
    dragRef.current = { key: ligne.key, mode, x0: e.clientX, d0: b[0], d1: b[1], ligne, bouge: false };
    const bouger = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = Math.round((ev.clientX - d.x0) / ppd);
      if (delta !== 0) d.bouge = true;
      let n0 = d.d0, n1 = d.d1;
      if (d.mode === "deplacer") { n0 += delta; n1 += delta; }
      else if (d.mode === "debut") n0 = Math.min(d.d0 + delta, d.d1);
      else n1 = Math.max(d.d1 + delta, d.d0);
      setApercu({ [d.key]: { d0: n0, d1: n1 } });
    };
    const finir = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", finir);
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      const delta = Math.round((ev.clientX - d.x0) / ppd);
      if (!d.bouge || delta === 0) {
        setApercu({});
        if (d.ligne.kind === "tache") onOuvrir(d.ligne.t);
        return;
      }
      let n0 = d.d0, n1 = d.d1;
      if (d.mode === "deplacer") { n0 += delta; n1 += delta; }
      else if (d.mode === "debut") n0 = Math.min(d.d0 + delta, d.d1);
      else n1 = Math.max(d.d1 + delta, d.d0);
      try {
        const l = d.ligne;
        if (l.kind === "tache") {
          const r = await projet.modifier(l.t.id, { debut: versIso(n0), fin: versIso(l.t.type === "jalon" ? n0 : n1), cascade });
          onMessage(true, `« ${l.t.titre} » : ${fmtJour(versIso(n0))} → ${fmtJour(versIso(l.t.type === "jalon" ? n0 : n1))}${r.decalees.length ? ` — ${r.decalees.length} tâche(s) dépendante(s) décalée(s)` : ""}.`);
        } else if (l.kind === "phase" && l.phase) {
          if (l.phase.planifiee_par_taches) {
            if (d.mode !== "deplacer") throw new Error("La durée d'une phase découle de ses tâches : déplacez la phase entière ou modifiez les tâches.");
            await projet.decalerPhase(planning.operation.id, l.phase.id, delta, cascade);
            onMessage(true, `Phase « ${l.phase.nom} » décalée de ${delta > 0 ? "+" : ""}${delta} jour(s) avec ses tâches.`);
          } else {
            await projet.majPhase(l.phase.id, { date_debut: versIso(n0), date_cible: versIso(n1) });
            onMessage(true, `Phase « ${l.phase.nom} » : ${fmtJour(versIso(n0))} → ${fmtJour(versIso(n1))}.`);
          }
        }
        await onRecharger();
      } catch (err) {
        onMessage(false, String((err as Error).message || err));
      } finally {
        setApercu({});
      }
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", finir);
  };

  const basculer = (key: string) =>
    setReplies((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  // ── Dépendances (flèches fin → début)
  const index = new Map(lignes.map((l, i) => [l.key, i]));
  const fleches: { d: string; actif: boolean }[] = [];
  for (const l of lignes) {
    if (l.kind !== "tache") continue;
    for (const dep of l.t.dependances) {
      const ip = index.get(`t${dep}`);
      const is = index.get(l.key);
      if (ip === undefined || is === undefined) continue;
      const pl = lignes[ip];
      const bp = bornes(pl), bs = bornes(l);
      if (!bp || !bs || pl.kind !== "tache") continue;
      const x1 = pl.t.type === "jalon" ? x(bp[0]) + ppd / 2 + 8 : x(bp[1] + 1);
      const x2 = l.t.type === "jalon" ? x(bs[0]) + ppd / 2 - 8 : x(bs[0]);
      const y1 = ip * H + H / 2, y2 = is * H + H / 2;
      const sens = y2 > y1 ? 1 : -1;
      const d = x2 - x1 >= 14
        ? `M${x1},${y1} H${x1 + 7} V${y2} H${x2 - 1}`
        : `M${x1},${y1} H${x1 + 7} V${y2 - (sens * H) / 2} H${x2 - 9} V${y2} H${x2 - 1}`;
      fleches.push({ d, actif: survol === l.t.id || survol === dep });
    }
  }

  const tout = planning.phases.map((p) => `p${p.id}`).concat(planning.taches.some((t) => !t.phase_id) ? ["p0"] : []);

  return (
    <div className="rounded-sm border border-paper-200 bg-white">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-paper-200">
        <button onClick={() => setGauche(!gauche)} className="p-1.5 rounded-sm text-ink-500 hover:bg-paper-100" title={gauche ? "Masquer la liste" : "Afficher la liste"}>
          {gauche ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        </button>
        <button onClick={() => setReplies(new Set())} className="text-xs px-2 py-1 rounded-sm text-ink-700 hover:bg-paper-100 inline-flex items-center gap-1"><ChevronsUpDown size={13} /> Tout déplier</button>
        <button onClick={() => setReplies(new Set(tout))} className="text-xs px-2 py-1 rounded-sm text-ink-700 hover:bg-paper-100 inline-flex items-center gap-1"><ChevronsDownUp size={13} /> Tout replier</button>
        <span className="h-4 w-px bg-paper-200" />
        <div className="inline-flex rounded-sm border border-paper-200 overflow-hidden">
          {(["jour", "semaine", "mois"] as Zoom[]).map((z) => (
            <button key={z} onClick={() => setZoom(z)} className={cn("px-2.5 py-1 text-xs", zoom === z ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-paper-50")}>
              {z === "jour" ? "Jours" : z === "semaine" ? "Semaines" : "Mois"}
            </button>
          ))}
        </div>
        <button onClick={allerAujourdhui} className="text-xs px-2.5 py-1 rounded-sm border border-paper-200 hover:bg-paper-50">Aujourd'hui</button>
        {moi && (
          <label className="text-xs text-ink-700 inline-flex items-center gap-1.5">
            <input type="checkbox" checked={mesTaches} onChange={(e) => setMesTaches(e.target.checked)} /> Mes tâches
          </label>
        )}
        {canEdit && (
          <label className="text-xs text-ink-700 inline-flex items-center gap-1.5" title="Quand une tâche se termine plus tard, ses successeurs sont repoussés">
            <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} /> Décaler les tâches dépendantes
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          <a href={`/api/projet/operation/${planning.operation.id}/export.xlsx`} className="text-xs px-2.5 py-1 rounded-sm border border-paper-200 hover:bg-paper-50 inline-flex items-center gap-1.5 text-ink-700">
            <Download size={13} /> Exporter
          </a>
          {canEdit && (
            <button onClick={() => onCreer({ phase_id: planning.phases[0]?.id ?? null, type: "tache" })} className="text-xs px-2.5 py-1 rounded-sm bg-brand-500 text-white hover:bg-brand-700 inline-flex items-center gap-1.5">
              <Plus size={13} /> Tâche
            </button>
          )}
        </div>
      </div>

      {/* Diagramme */}
      <div ref={scrollRef} className="overflow-auto relative select-none" style={{ maxHeight: "72vh" }}>
        <div className="relative" style={{ width: L + W, height: HE + lignes.length * H }}>
          {/* En-tête */}
          <div className="sticky top-0 z-20 flex" style={{ height: HE }}>
            <div className="sticky left-0 z-30 bg-paper-50 border-r border-b border-paper-200 flex items-end text-[11px] uppercase tracking-widest text-ink-500 font-medium overflow-hidden" style={{ width: L, minWidth: L }}>
              {gauche && (
                <>
                  <div className="w-11 px-2 pb-2">N°</div>
                  <div className="flex-1 px-2 pb-2">Tâche</div>
                  {!etroit && <div className="w-[88px] px-2 pb-2">Assignés</div>}
                  {!etroit && <div className="w-[100px] px-2 pb-2">Statut</div>}
                </>
              )}
            </div>
            <div className="relative bg-paper-50 border-b border-paper-200" style={{ width: W }}>
              {haut.map((s, i) => (
                <div key={i} className="absolute top-0 h-[26px] border-l border-paper-200 px-1.5 text-[11px] text-ink-700 font-medium leading-[26px] whitespace-nowrap overflow-hidden capitalize" style={{ left: s.l, width: s.w }}>{s.t}</div>
              ))}
              {bas.map((s, i) => (
                <div key={i} className={cn("absolute top-[26px] h-[26px] border-l border-t border-paper-200 text-[11px] leading-[26px] whitespace-nowrap overflow-hidden text-center", s.we ? "text-ink-300 bg-paper-100" : "text-ink-500")} style={{ left: s.l, width: s.w }}>
                  {s.t}{s.s && <span className="text-ink-300 ml-0.5">({s.s})</span>}
                </div>
              ))}
              {auj >= debut && auj <= fin && (
                <div className="absolute bottom-0 text-[10px] font-semibold text-white bg-danger-500 rounded-sm px-1 -translate-x-1/2" style={{ left: x(auj) + ppd / 2 }}>auj.</div>
              )}
            </div>
          </div>

          {/* Fond : week-ends et aujourd'hui */}
          <div className="absolute pointer-events-none" style={{ left: L, top: HE, width: W, height: lignes.length * H }}>
            {weekends.map((n) => <div key={n} className="absolute top-0 bottom-0 bg-paper-50" style={{ left: x(n), width: ppd }} />)}
            {zoom !== "jour" && bas.map((s, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-paper-100" style={{ left: s.l }} />)}
            {auj >= debut && auj <= fin && <div className="absolute top-0 bottom-0 w-px bg-danger-500/70 z-[6]" style={{ left: x(auj) + ppd / 2 }} />}
            <svg className="absolute inset-0 overflow-visible z-[4]" width={W} height={lignes.length * H}>
              <defs>
                <marker id="fleche" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 z" fill="#d4a017" />
                </marker>
                <marker id="fleche-active" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 z" fill="#343aab" />
                </marker>
              </defs>
              {fleches.map((f, i) => (
                <path key={i} d={f.d} fill="none" stroke={f.actif ? "#343aab" : "#e0b84a"} strokeWidth={f.actif ? 2 : 1.4} markerEnd={`url(#${f.actif ? "fleche-active" : "fleche"})`} />
              ))}
            </svg>
          </div>

          {/* Lignes */}
          {lignes.map((l) => {
            const b = bornes(l);
            const enRetard = l.kind === "tache" && l.t.statut !== "termine" && versJour(l.t.fin) < auj;
            return (
              <div key={l.key} className="flex group" style={{ height: H }} onMouseEnter={() => l.kind === "tache" && setSurvol(l.t.id)} onMouseLeave={() => setSurvol(null)}>
                {/* Colonne de gauche */}
                <div
                  className={cn("sticky left-0 z-10 border-r border-b border-paper-200 flex items-center overflow-hidden text-sm",
                    l.kind === "phase" ? "bg-paper-50" : "bg-white group-hover:bg-brand-50/40")}
                  style={{ width: L, minWidth: L }}
                >
                  {gauche && l.kind === "projet" && (
                    <div className="px-3 font-semibold text-ink-900 truncate">{planning.operation.nom} <span className="text-[11px] text-ink-500 font-normal">· {planning.projet.avancement} %</span></div>
                  )}
                  {gauche && l.kind === "phase" && (
                    <>
                      <div className="w-11 px-2 text-xs font-semibold text-ink-700">{l.num}</div>
                      <button onClick={() => basculer(l.key)} className="flex-1 min-w-0 px-1 flex items-center gap-1 text-left font-semibold text-ink-900">
                        {l.ouvert ? <ChevronDown size={14} className="shrink-0 text-ink-500" /> : <ChevronRight size={14} className="shrink-0 text-ink-500" />}
                        <span className="truncate">{l.phase ? l.phase.nom : "Sans phase"}</span>
                        {l.phase && <span className="text-[11px] text-ink-500 font-normal ml-1 shrink-0">{l.phase.avancement} %</span>}
                      </button>
                      {!etroit && <div className="w-[88px] px-2">{l.phase?.responsable ? <Avatars users={[l.phase.responsable]} noms={noms} /> : null}</div>}
                      {!etroit && <div className="w-[100px] px-2">{l.phase && <StatutPoint statut={l.phase.statut} />}</div>}
                    </>
                  )}
                  {gauche && l.kind === "tache" && (
                    <>
                      <div className="w-11 px-2 text-xs text-ink-500">{l.num}</div>
                      <button
                        onClick={() => onOuvrir(l.t)}
                        className={cn("flex-1 min-w-0 text-left truncate hover:underline", l.niveau === 2 ? "pl-7" : "pl-3", l.t.statut === "termine" && l.t.type === "tache" && l.t.avancement === 100 ? "text-ink-500" : "text-ink-900")}
                        title={l.t.titre}
                      >
                        {l.aEnfants && (
                          <span onClick={(e) => { e.stopPropagation(); basculer(l.key); }} className="inline-block align-middle mr-0.5 text-ink-500">
                            {replies.has(l.key) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          </span>
                        )}
                        {l.t.type === "jalon" && <span className="mr-1" style={{ color: COULEUR_JALON }}>◆</span>}
                        {l.t.titre}
                      </button>
                      {!etroit && <div className="w-[88px] px-2"><Avatars users={l.t.assignes} noms={noms} /></div>}
                      {!etroit && <div className="w-[100px] px-2"><StatutPoint statut={l.t.statut} className={enRetard ? "text-danger-500" : ""} /></div>}
                    </>
                  )}
                  {gauche && l.kind === "ajout" && (
                    <div className="pl-14 text-xs text-brand-500 flex items-center gap-1.5">
                      <Plus size={12} />
                      <button onClick={() => onCreer({ phase_id: l.phaseId, type: "tache" })} className="hover:underline">Ajouter une tâche</button>
                      <span className="text-ink-300">|</span>
                      <button onClick={() => onCreer({ phase_id: l.phaseId, type: "jalon" })} className="hover:underline">Ajouter un jalon</button>
                    </div>
                  )}
                </div>

                {/* Barre */}
                <div className={cn("relative border-b border-paper-100", l.kind === "phase" && "bg-paper-50/40")} style={{ width: W }}>
                  {b && l.kind === "projet" && (
                    <div className="absolute rounded-sm overflow-hidden" style={{ left: x(b[0]), width: (b[1] - b[0] + 1) * ppd, top: 14, height: 8, background: "#d1d5db" }} title={`Projet : ${fmtJour(versIso(b[0]))} – ${fmtJour(versIso(b[1]))}`}>
                      <div className="h-full" style={{ width: `${planning.projet.avancement}%`, background: "#6b7280" }} />
                    </div>
                  )}
                  {b && l.kind === "phase" && (
                    <>
                      <div className="absolute text-[11px] font-semibold whitespace-nowrap" style={{ left: x(b[0]), top: 4, color: COULEUR_PHASE.plein }}>
                        {l.phase ? l.phase.nom : "Sans phase"} <span className="font-normal text-ink-500">{fmtJour(versIso(b[0]))} – {fmtJour(versIso(b[1]))}</span>
                      </div>
                      <div
                        onPointerDown={(e) => l.phase && demarrer(e, l, "deplacer")}
                        className={cn("absolute rounded-sm overflow-hidden", canEdit && l.phase && "cursor-grab active:cursor-grabbing")}
                        style={{ left: x(b[0]), width: (b[1] - b[0] + 1) * ppd, top: 22, height: 7, background: COULEUR_PHASE.fond }}
                      >
                        <div className="h-full" style={{ width: `${l.phase?.avancement ?? 0}%`, background: COULEUR_PHASE.plein }} />
                      </div>
                      {canEdit && l.phase && !l.phase.planifiee_par_taches && (
                        <span onPointerDown={(e) => demarrer(e, l, "fin")} className="absolute w-2 cursor-ew-resize" style={{ left: x(b[1] + 1) - 4, top: 19, height: 13 }} />
                      )}
                    </>
                  )}
                  {b && l.kind === "tache" && l.t.type === "tache" && (
                    <>
                      <div
                        onPointerDown={(e) => demarrer(e, l, "deplacer")}
                        className={cn("absolute rounded-[3px] overflow-hidden shadow-sm", canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", enRetard && "ring-2 ring-danger-500")}
                        style={{ left: x(b[0]), width: Math.max(ppd, (b[1] - b[0] + 1) * ppd), top: 9, height: 18, background: STATUTS[l.t.statut].fond }}
                        title={`${l.t.titre} — ${fmtJour(versIso(b[0]))} → ${fmtJour(versIso(b[1]))} · ${l.t.avancement} %`}
                      >
                        <div className="h-full" style={{ width: `${l.t.avancement}%`, background: STATUTS[l.t.statut].plein }} />
                        {canEdit && (
                          <>
                            <span onPointerDown={(e) => demarrer(e, l, "debut")} className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-black/20" />
                            <span onPointerDown={(e) => demarrer(e, l, "fin")} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-black/20" />
                          </>
                        )}
                      </div>
                      <div className="absolute text-xs text-ink-700 whitespace-nowrap pointer-events-none" style={{ left: x(b[0]) + Math.max(ppd, (b[1] - b[0] + 1) * ppd) + 6, top: 10 }}>
                        {l.t.titre}
                        {apercu[l.key] && <span className="ml-2 text-brand-700 font-semibold">{fmtJour(versIso(b[0]))} → {fmtJour(versIso(b[1]))}</span>}
                      </div>
                    </>
                  )}
                  {b && l.kind === "tache" && l.t.type === "jalon" && (
                    <>
                      <div
                        onPointerDown={(e) => demarrer(e, l, "deplacer")}
                        className={cn("absolute", canEdit ? "cursor-grab" : "cursor-pointer")}
                        style={{ left: x(b[0]) + ppd / 2 - 8, top: 10, width: 16, height: 16, transform: "rotate(45deg)", background: l.t.statut === "termine" ? "#86198f" : COULEUR_JALON, borderRadius: 2 }}
                        title={`${l.t.titre} — ${fmtJour(versIso(b[0]))}`}
                      />
                      <div className="absolute text-xs text-ink-700 whitespace-nowrap pointer-events-none" style={{ left: x(b[0]) + ppd / 2 + 14, top: 10 }}>
                        {l.t.titre} <span className="text-ink-500">{fmtJour(versIso(b[0]))}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-paper-200 text-[11px] text-ink-500">
        {Object.entries(STATUTS).map(([k, s]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="w-5 h-2.5 rounded-sm" style={{ background: `linear-gradient(90deg, ${s.plein} 50%, ${s.fond} 50%)` }} />{s.l}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rotate-45" style={{ background: COULEUR_JALON }} />Jalon</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-5 h-1.5 rounded-sm" style={{ background: COULEUR_PHASE.plein }} />Phase</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-5 h-px" style={{ background: "#e0b84a" }} />Dépendance</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-px h-3 bg-danger-500" />Aujourd'hui</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2.5 rounded-sm ring-2 ring-danger-500" />En retard</span>
        {canEdit && <span className="ml-auto">Glissez une barre pour la déplacer, ses bords pour changer les dates · cliquez pour modifier</span>}
      </div>
    </div>
  );
}
