"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, Download, MapPin, Plus, Trash2, Upload, Users } from "lucide-react";
import { api } from "@/lib/api";
import { collab, LIBELLES_TYPE, type Tache } from "@/lib/collab";
import { cleJour, parseUtc, versInputLocal } from "@/lib/dates";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import type { Operation } from "@/lib/types";
import { ImportModal } from "@/components/import-modal";
import { Bouton, Modal, champ, etiquette } from "@/components/collab/modal";
import { UserPicker } from "@/components/collab/user-picker";

type Evt = {
  id: number;
  titre: string;
  description: string;
  debut: string;
  fin: string | null;
  toute_journee: boolean;
  type_event: string;
  operation_id: number | null;
  organisateur: string;
  participants: string[];
  lieu: string;
};
type Item =
  | { kind: "evt"; id: string; date: Date; evt: Evt }
  | { kind: "tache"; id: string; date: Date; tache: Tache };
type Vue = "mois" | "semaine" | "liste";

const TYPES: Record<string, { l: string; c: string; dot: string }> = {
  copil: { l: "COPIL", c: "bg-brand-50 text-brand-700 border-brand-500/40", dot: "bg-brand-500" },
  coproj: { l: "COPROJ", c: "bg-ok-50 text-ok-500 border-ok-500/40", dot: "bg-ok-500" },
  jalon: { l: "Jalon", c: "bg-warn-50 text-warn-500 border-warn-500/40", dot: "bg-warn-500" },
  rdv: { l: "Rendez-vous", c: "bg-paper-100 text-ink-700 border-paper-200", dot: "bg-ink-500" },
  deadline: { l: "Deadline", c: "bg-danger-50 text-danger-500 border-danger-500/40", dot: "bg-danger-500" },
  autre: { l: "Autre", c: "bg-paper-100 text-ink-500 border-paper-200", dot: "bg-ink-300" },
};
const TACHE_STYLE = "bg-white text-ink-900 border-dashed border-ink-300";
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function debutSemaine(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function ajouterJours(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const heure = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function AgendaClient() {
  const params = useSearchParams();
  const dateUrl = params.get("date");
  const [vue, setVue] = useState<Vue>("mois");
  const [curseur, setCurseur] = useState<Date>(() => (dateUrl ? new Date(`${dateUrl}T12:00:00`) : new Date()));
  const [jourSel, setJourSel] = useState<string>(() => dateUrl || cleJour(new Date()));
  const [evts, setEvts] = useState<Evt[]>([]);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [filtresTypes, setFiltresTypes] = useState<string[]>([]);
  const [avecTaches, setAvecTaches] = useState(true);
  const [mesSeulement, setMesSeulement] = useState(false);
  const [operationId, setOperationId] = useState<number | null>(null);
  const [edition, setEdition] = useState<{ evt?: Evt; date?: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [moi, setMoi] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    const u = getUser();
    setMoi(u ? { username: u.username, role: u.role } : null);
    api.listOperations().then(setOperations).catch(() => {});
  }, []);
  const peutEditer = moi?.role === "admin" || moi?.role === "saisie";

  // Période affichée
  const { debut, fin, titre } = useMemo(() => {
    if (vue === "mois") {
      const premier = new Date(curseur.getFullYear(), curseur.getMonth(), 1);
      const d = debutSemaine(premier);
      return { debut: d, fin: ajouterJours(d, 42), titre: curseur.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
    }
    if (vue === "semaine") {
      const d = debutSemaine(curseur);
      const f = ajouterJours(d, 7);
      return { debut: d, fin: f, titre: `Semaine du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${ajouterJours(f, -1).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` };
    }
    const d = new Date(curseur.getFullYear(), curseur.getMonth(), curseur.getDate());
    return { debut: d, fin: ajouterJours(d, 60), titre: `À partir du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` };
  }, [vue, curseur]);

  const charger = useCallback(async () => {
    setErr(null);
    try {
      setEvts(await api.listEvents(debut.toISOString(), fin.toISOString(), operationId ?? undefined));
    } catch (e) {
      setErr(String(e));
    }
    if (getUser()) collab.taches("toutes", "a_faire").then(setTaches).catch(() => setTaches([]));
  }, [debut, fin, operationId]);
  useEffect(() => { charger(); }, [charger]);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const e of evts) {
      if (filtresTypes.length && !filtresTypes.includes(e.type_event)) continue;
      if (mesSeulement && moi && e.organisateur !== moi.username && !e.participants.includes(moi.username)) continue;
      const d = parseUtc(e.debut);
      if (d) out.push({ kind: "evt", id: `e${e.id}`, date: d, evt: e });
    }
    if (avecTaches && (!filtresTypes.length || filtresTypes.includes("taches"))) {
      for (const t of taches) {
        if (operationId && t.operation_id !== operationId) continue;
        const d = parseUtc(t.echeance);
        if (d && d >= debut && d < fin) out.push({ kind: "tache", id: `t${t.id}`, date: d, tache: t });
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [evts, taches, filtresTypes, mesSeulement, moi, avecTaches, operationId, debut, fin]);

  const parJour = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const it of items) (m[cleJour(it.date)] ||= []).push(it);
    return m;
  }, [items]);

  const naviguer = (sens: -1 | 1) => {
    const d = new Date(curseur);
    if (vue === "mois") d.setMonth(d.getMonth() + sens, 1);
    else if (vue === "semaine") d.setDate(d.getDate() + 7 * sens);
    else d.setDate(d.getDate() + 30 * sens);
    setCurseur(d);
  };
  const aujourdhui = () => {
    setCurseur(new Date());
    setJourSel(cleJour(new Date()));
  };
  const toggleType = (t: string) => setFiltresTypes((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));

  const ouvrir = (it: Item) => {
    if (it.kind === "tache") window.location.href = `/taches?id=${it.tache.id}`;
    else setEdition({ evt: it.evt });
  };
  const nouveau = (jour?: string) => {
    if (!peutEditer) {
      setErr(moi ? "Votre profil (lecteur) ne permet pas de créer un événement." : "Connectez-vous pour créer un événement.");
      return;
    }
    setEdition({ date: jour || jourSel });
  };

  const aujourdhuiCle = cleJour(new Date());

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500 flex items-center gap-2"><Calendar size={11} /> Agenda partagé</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Calendrier équipe</h1>
          <p className="text-sm text-ink-500 mt-1">COPIL, COPROJ, jalons, rendez-vous, deadlines et échéances de vos tâches.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/agenda/export.ics${operationId ? `?operation_id=${operationId}` : ""}`} className="text-xs px-3 py-1.5 border border-paper-200 bg-white text-ink-700 rounded-sm hover:bg-paper-50 inline-flex items-center gap-1.5" title="À importer dans Outlook, Google Agenda…">
            <Download size={13} /> Export iCal
          </a>
          <Bouton onClick={() => setImportOpen(true)}><Upload size={13} /> Import iCal</Bouton>
          <Bouton onClick={() => nouveau()} variante="primaire"><Plus size={13} /> Nouvel événement</Bouton>
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import iCalendar (.ics)"
        description="Importer un fichier .ics exporté depuis Outlook, Google Agenda, Thunderbird… Les événements seront ajoutés à l'agenda partagé."
        acceptedExtensions=".ics"
        doImport={(f) => api.importIcs(f, operationId ?? undefined) as Promise<{ ok: boolean; nb_crees: number }>}
        onSuccess={() => setTimeout(charger, 1000)}
      />

      {err && <div className="mb-3 rounded-sm border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm">{err}</div>}

      {/* Barre de navigation */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex items-center rounded-sm border border-paper-200 bg-white">
          <button onClick={() => naviguer(-1)} className="p-1.5 hover:bg-paper-50" aria-label="Précédent"><ChevronLeft size={16} /></button>
          <button onClick={aujourdhui} className="px-3 py-1 text-xs border-x border-paper-200 hover:bg-paper-50">Aujourd'hui</button>
          <button onClick={() => naviguer(1)} className="p-1.5 hover:bg-paper-50" aria-label="Suivant"><ChevronRight size={16} /></button>
        </div>
        <h2 className="font-serif text-lg text-ink-900 capitalize mr-auto">{titre}</h2>
        <div className="inline-flex rounded-sm border border-paper-200 bg-white overflow-hidden">
          {(["mois", "semaine", "liste"] as Vue[]).map((v) => (
            <button key={v} onClick={() => setVue(v)} className={cn("px-3 py-1 text-xs capitalize", vue === v ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-paper-50")}>{v}</button>
          ))}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {Object.entries(TYPES).map(([k, t]) => (
          <button key={k} onClick={() => toggleType(k)} className={cn("text-[11px] px-2 py-0.5 rounded-sm border inline-flex items-center gap-1", filtresTypes.includes(k) ? t.c + " font-semibold" : "border-paper-200 text-ink-500 bg-white")}>
            <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} /> {t.l}
          </button>
        ))}
        {moi && (
          <button onClick={() => (filtresTypes.length ? toggleType("taches") : setAvecTaches(!avecTaches))} className={cn("text-[11px] px-2 py-0.5 rounded-sm border", (filtresTypes.length ? filtresTypes.includes("taches") : avecTaches) ? "border-ink-500 text-ink-900 bg-white font-semibold" : "border-paper-200 text-ink-500 bg-white")}>
            ✓ Échéances de tâches
          </button>
        )}
        {filtresTypes.length > 0 && <button onClick={() => setFiltresTypes([])} className="text-[11px] text-brand-500 hover:underline">tout afficher</button>}
        <span className="mx-1 h-4 w-px bg-paper-200" />
        {moi && (
          <label className="text-[11px] text-ink-700 inline-flex items-center gap-1">
            <input type="checkbox" checked={mesSeulement} onChange={(e) => setMesSeulement(e.target.checked)} /> Mes événements uniquement
          </label>
        )}
        <select value={operationId ?? ""} onChange={(e) => setOperationId(e.target.value ? Number(e.target.value) : null)} className="text-[11px] px-2 py-0.5 border border-paper-200 rounded-sm bg-white">
          <option value="">Toutes les opérations</option>
          {operations.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
        </select>
      </div>

      {vue === "mois" && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-3 rounded-sm border border-paper-200 bg-white overflow-hidden">
            <div className="grid grid-cols-7 bg-paper-50 border-b border-paper-200">
              {JOURS.map((j) => <div key={j} className="px-2 py-1.5 text-[11px] uppercase tracking-widest text-ink-500 text-center sm:text-left">{j}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }, (_, i) => {
                const d = ajouterJours(debut, i);
                const cle = cleJour(d);
                const liste = parJour[cle] || [];
                const horsMois = d.getMonth() !== curseur.getMonth();
                const sel = cle === jourSel;
                return (
                  <div
                    key={cle}
                    onClick={() => setJourSel(cle)}
                    onDoubleClick={() => nouveau(cle)}
                    className={cn(
                      "min-h-[64px] sm:min-h-[104px] border-b border-r border-paper-200 p-1 cursor-pointer transition group relative",
                      horsMois && "bg-paper-50/70",
                      sel ? "ring-2 ring-inset ring-brand-500" : "hover:bg-brand-50/40"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs w-6 h-6 inline-flex items-center justify-center rounded-full", cle === aujourdhuiCle ? "bg-brand-500 text-white font-semibold" : horsMois ? "text-ink-300" : "text-ink-700")}>
                        {d.getDate()}
                      </span>
                      {peutEditer && (
                        <button onClick={(e) => { e.stopPropagation(); nouveau(cle); }} className="hidden sm:inline-flex opacity-0 group-hover:opacity-100 p-0.5 text-ink-500 hover:text-brand-500" title="Ajouter un événement ce jour">
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                    {/* Mobile : pastilles */}
                    <div className="flex flex-wrap gap-0.5 mt-1 sm:hidden">
                      {liste.slice(0, 4).map((it) => <span key={it.id} className={cn("w-1.5 h-1.5 rounded-full", it.kind === "tache" ? "bg-ink-300" : TYPES[it.evt.type_event]?.dot || "bg-ink-300")} />)}
                    </div>
                    {/* Bureau : étiquettes */}
                    <div className="hidden sm:block space-y-0.5 mt-0.5">
                      {liste.slice(0, 3).map((it) => <Puce key={it.id} it={it} onClick={(e) => { e.stopPropagation(); ouvrir(it); }} />)}
                      {liste.length > 3 && <div className="text-[11px] text-ink-500 px-1">+ {liste.length - 3} autre{liste.length - 3 > 1 ? "s" : ""}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <JourDetail cle={jourSel} items={parJour[jourSel] || []} onOuvrir={ouvrir} onNouveau={peutEditer ? () => nouveau(jourSel) : undefined} />
        </div>
      )}

      {vue === "semaine" && (
        <div className="grid grid-cols-1 md:grid-cols-7 rounded-sm border border-paper-200 bg-white overflow-hidden">
          {Array.from({ length: 7 }, (_, i) => {
            const d = ajouterJours(debut, i);
            const cle = cleJour(d);
            const liste = parJour[cle] || [];
            return (
              <div key={cle} className="border-b md:border-b-0 md:border-r border-paper-200 min-h-[120px] md:min-h-[420px]">
                <div className={cn("px-2 py-1.5 border-b border-paper-200 flex items-center justify-between", cle === aujourdhuiCle ? "bg-brand-50" : "bg-paper-50")}>
                  <span className="text-xs text-ink-700"><span className="uppercase text-[11px] tracking-widest text-ink-500 mr-1">{JOURS[i]}</span>{d.getDate()}</span>
                  {peutEditer && <button onClick={() => nouveau(cle)} className="p-0.5 text-ink-500 hover:text-brand-500" title="Ajouter"><Plus size={12} /></button>}
                </div>
                <div className="p-1.5 space-y-1">
                  {liste.map((it) => <Puce key={it.id} it={it} onClick={() => ouvrir(it)} detaille />)}
                  {liste.length === 0 && <div className="text-[11px] text-ink-300 italic px-1 hidden md:block">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {vue === "liste" && (
        <div className="space-y-5">
          {Object.keys(parJour).sort().map((cle) => (
            <div key={cle}>
              <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium mb-1.5">
                {new Date(`${cle}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
              <div className="space-y-1.5">{parJour[cle].map((it) => <Carte key={it.id} it={it} onClick={() => ouvrir(it)} />)}</div>
            </div>
          ))}
          {items.length === 0 && <div className="rounded-sm border border-paper-200 bg-white p-8 text-center text-sm text-ink-500">Aucun événement sur les 60 prochains jours.</div>}
        </div>
      )}

      {edition && (
        <EvenementModal
          evt={edition.evt}
          date={edition.date}
          operations={operations}
          peutEditer={peutEditer}
          onClose={() => setEdition(null)}
          onFait={() => { setEdition(null); charger(); }}
        />
      )}
    </div>
  );
}

function Puce({ it, onClick, detaille = false }: { it: Item; onClick: (e: React.MouseEvent) => void; detaille?: boolean }) {
  if (it.kind === "tache") {
    return (
      <button onClick={onClick} className={cn("w-full text-left text-[11px] px-1.5 py-0.5 rounded-sm border truncate block", TACHE_STYLE, it.tache.en_retard && "border-danger-500 text-danger-500")} title={`${LIBELLES_TYPE[it.tache.type_tache]} : ${it.tache.titre}`}>
        ✓ {it.tache.titre}
      </button>
    );
  }
  const t = TYPES[it.evt.type_event] || TYPES.autre;
  return (
    <button onClick={onClick} className={cn("w-full text-left text-[11px] px-1.5 py-0.5 rounded-sm border block", t.c, detaille ? "whitespace-normal" : "truncate")} title={it.evt.titre}>
      {!it.evt.toute_journee && <span className="tabular-nums mr-1 opacity-80">{heure(it.date)}</span>}
      {it.evt.titre}
      {detaille && it.evt.lieu && <span className="block opacity-70">{it.evt.lieu}</span>}
    </button>
  );
}

function Carte({ it, onClick }: { it: Item; onClick: () => void }) {
  if (it.kind === "tache") {
    const t = it.tache;
    return (
      <button onClick={onClick} className="w-full text-left rounded-sm border border-dashed border-ink-300 bg-white p-3 flex items-start gap-3 hover:border-brand-500">
        <div className="w-14 text-xs text-ink-500">échéance</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-ink-900">✓ {LIBELLES_TYPE[t.type_tache]} : {t.titre}</div>
          <div className="text-[11px] text-ink-500">{t.emetteur_nom} → {t.destinataire_nom}{t.en_retard && <span className="text-danger-500 font-medium"> · en retard</span>}</div>
        </div>
      </button>
    );
  }
  const e = it.evt;
  const t = TYPES[e.type_event] || TYPES.autre;
  return (
    <button onClick={onClick} className="w-full text-left rounded-sm border border-paper-200 bg-white p-3 flex items-start gap-3 hover:border-brand-500">
      <div className="w-14 text-sm text-ink-700 font-mono tabular-nums">{e.toute_journee ? "journée" : heure(it.date)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[11px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-sm border", t.c)}>{t.l}</span>
          <span className="text-sm font-medium text-ink-900">{e.titre}</span>
        </div>
        {e.lieu && <div className="text-xs text-ink-500 mt-0.5 inline-flex items-center gap-1"><MapPin size={11} /> {e.lieu}</div>}
        {e.participants.length > 0 && <div className="text-[11px] text-ink-500 mt-0.5 inline-flex items-center gap-1 ml-3"><Users size={11} /> {e.participants.length} participant{e.participants.length > 1 ? "s" : ""}</div>}
      </div>
    </button>
  );
}

function JourDetail({ cle, items, onOuvrir, onNouveau }: { cle: string; items: Item[]; onOuvrir: (it: Item) => void; onNouveau?: () => void }) {
  const d = new Date(`${cle}T12:00:00`);
  return (
    <aside className="rounded-sm border border-paper-200 bg-white self-start">
      <div className="px-4 py-3 border-b border-paper-200 flex items-center justify-between">
        <div className="text-sm text-ink-900 font-medium capitalize">{d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
        {onNouveau && <button onClick={onNouveau} className="text-[11px] text-brand-500 hover:underline inline-flex items-center gap-1"><Plus size={11} /> Ajouter</button>}
      </div>
      <div className="p-3 space-y-1.5">
        {items.length === 0 && <div className="text-xs text-ink-500 italic px-1 py-2">Rien de prévu ce jour.</div>}
        {items.map((it) => <Carte key={it.id} it={it} onClick={() => onOuvrir(it)} />)}
      </div>
    </aside>
  );
}

function EvenementModal({
  evt, date, operations, peutEditer, onClose, onFait,
}: {
  evt?: Evt;
  date?: string;
  operations: Operation[];
  peutEditer: boolean;
  onClose: () => void;
  onFait: () => void;
}) {
  const d0 = evt ? parseUtc(evt.debut)! : new Date(`${date}T09:00:00`);
  const f0 = evt?.fin ? parseUtc(evt.fin) : new Date(d0.getTime() + 60 * 60 * 1000);
  const [f, setF] = useState({
    titre: evt?.titre || "",
    type_event: evt?.type_event || "rdv",
    debut: versInputLocal(d0),
    fin: f0 ? versInputLocal(f0) : "",
    toute_journee: evt?.toute_journee || false,
    lieu: evt?.lieu || "",
    description: evt?.description || "",
    operation_id: evt?.operation_id ?? null as number | null,
  });
  const [participants, setParticipants] = useState<string[]>(evt?.participants || []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lectureSeule = !peutEditer;

  const enregistrer = async () => {
    setErr(null);
    if (!f.titre.trim()) return setErr("Le titre est obligatoire.");
    const debut = new Date(f.toute_journee ? `${f.debut.slice(0, 10)}T00:00:00` : f.debut);
    const fin = f.fin ? new Date(f.toute_journee ? `${f.fin.slice(0, 10)}T23:59:00` : f.fin) : null;
    if (fin && fin < debut) return setErr("La fin doit être après le début.");
    setBusy(true);
    try {
      const corps = { ...f, debut: debut.toISOString(), fin: fin ? fin.toISOString() : null, participants };
      if (evt) await api.updateEvent(evt.id, corps);
      else await api.createEvent(corps);
      onFait();
    } catch (e) {
      const m = String(e);
      setErr(m.includes("401") ? "Session expirée : reconnectez-vous." : m.includes("403") ? "Votre profil ne permet pas de modifier l'agenda." : m);
    } finally {
      setBusy(false);
    }
  };
  const supprimer = async () => {
    if (!evt || !confirm(`Supprimer « ${evt.titre} » ?`)) return;
    try {
      await api.deleteEvent(evt.id);
      onFait();
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <Modal
      titre={evt ? (lectureSeule ? evt.titre : "Modifier l'événement") : "Nouvel événement"}
      onClose={onClose}
      large
      pied={
        lectureSeule ? (
          <Bouton onClick={onClose}>Fermer</Bouton>
        ) : (
          <>
            {evt && <span className="mr-auto"><Bouton onClick={supprimer} variante="danger"><Trash2 size={13} /> Supprimer</Bouton></span>}
            <Bouton onClick={onClose} variante="discret">Annuler</Bouton>
            <Bouton onClick={enregistrer} disabled={busy} variante="primaire">{busy ? "Enregistrement…" : evt ? "Enregistrer et notifier" : "Créer et inviter"}</Bouton>
          </>
        )
      }
    >
      <fieldset disabled={lectureSeule} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><label className={etiquette}>Titre</label><input className={champ} value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} placeholder="ex. COPIL ECON'HOME" /></div>
        <div>
          <label className={etiquette}>Type</label>
          <select className={champ} value={f.type_event} onChange={(e) => setF({ ...f, type_event: e.target.value })}>
            {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.l}</option>)}
          </select>
        </div>
        <div>
          <label className={etiquette}>Opération</label>
          <select className={champ} value={f.operation_id ?? ""} onChange={(e) => setF({ ...f, operation_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {operations.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </div>
        <div>
          <label className={etiquette}>Début</label>
          <input type={f.toute_journee ? "date" : "datetime-local"} className={champ} value={f.toute_journee ? f.debut.slice(0, 10) : f.debut} onChange={(e) => setF({ ...f, debut: f.toute_journee ? `${e.target.value}T00:00` : e.target.value })} />
        </div>
        <div>
          <label className={etiquette}>Fin</label>
          <input type={f.toute_journee ? "date" : "datetime-local"} className={champ} value={f.toute_journee ? f.fin.slice(0, 10) : f.fin} onChange={(e) => setF({ ...f, fin: f.toute_journee ? `${e.target.value}T23:59` : e.target.value })} />
        </div>
        <label className="sm:col-span-2 text-sm text-ink-700 inline-flex items-center gap-2"><input type="checkbox" checked={f.toute_journee} onChange={(e) => setF({ ...f, toute_journee: e.target.checked })} /> Toute la journée</label>
        <div className="sm:col-span-2"><label className={etiquette}>Lieu / lien visio</label><input className={champ} value={f.lieu} onChange={(e) => setF({ ...f, lieu: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className={etiquette}>Description / ordre du jour</label><textarea className={cn(champ, "h-20")} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      </fieldset>
      <div className="mt-4">
        <label className={etiquette}>Participants — chacun reçoit une notification d'invitation (et en cas de changement d'horaire)</label>
        {lectureSeule ? (
          <div className="text-sm text-ink-700">{participants.join(", ") || "—"}</div>
        ) : (
          <UserPicker value={participants} onChange={setParticipants} hauteur="max-h-36" />
        )}
      </div>
      {evt && <p className="text-[11px] text-ink-500 mt-3">Organisé par {evt.organisateur}. <Link href="/taches" className="text-brand-500 hover:underline">Créer une tâche liée</Link></p>}
      {err && <div className="mt-3 rounded-sm border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm">{err}</div>}
    </Modal>
  );
}
