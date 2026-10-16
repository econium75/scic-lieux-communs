"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CalendarDays, Check, CheckCircle2, ClipboardList, Diamond, Eye, FileSignature, FileText,
  GanttChartSquare, Headphones, LogIn, MapPin, PenLine, Send, Sparkles, X,
} from "lucide-react";
import { accueil, type ElementAFaire, type MaJourneeData } from "@/lib/accueil";
import { collab, LIBELLES_TYPE } from "@/lib/collab";
import { aujourdHui, couleurAvatar, projet, versJour } from "@/lib/projet";
import { getUser } from "@/lib/auth";
import { cn, espacesLisibles } from "@/lib/format";
import { Brand } from "@/components/brand";

const eur = (v: number) => `${espacesLisibles(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v))} €`;

/** « aujourd'hui », « demain », « dans 3 j », « en retard de 2 j » à partir d'une date AAAA-MM-JJ. */
function quand(iso: string | null): { t: string; urgent: boolean } {
  if (!iso) return { t: "sans échéance", urgent: false };
  const d = versJour(iso) - aujourdHui();
  if (d < 0) return { t: `en retard de ${-d} j`, urgent: true };
  if (d === 0) return { t: "aujourd'hui", urgent: true };
  if (d === 1) return { t: "demain", urgent: false };
  if (d < 7) return { t: `dans ${d} j`, urgent: false };
  return { t: new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), urgent: false };
}

function ilYa(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

const ICONES = { validation: CheckCircle2, consultation: Eye, signature: FileSignature, autre: ClipboardList };

export function MaJournee() {
  const [data, setData] = useState<MaJourneeData | null>(null);
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setData(await accueil.charger());
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    }
  }, []);

  useEffect(() => {
    const ok = !!getUser();
    setConnecte(ok);
    if (ok) charger();
  }, [charger]);

  const agir = async (cle: string, fn: () => Promise<unknown>, texte: string) => {
    setEnCours(cle);
    try {
      await fn();
      setMsg({ ok: true, t: texte });
      await charger();
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    } finally {
      setEnCours(null);
    }
  };

  if (connecte === false)
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-sm border border-paper-200 bg-white p-8 text-center">
          <div className="flex justify-center mb-4"><Brand taille="grand" /></div>
          <p className="text-sm text-ink-700 mb-5">Connectez-vous pour retrouver vos tâches, vos documents à signer, votre agenda et vos opérations.</p>
          <Link href="/login" className="text-sm px-4 py-2 bg-brand-500 text-white rounded-sm hover:bg-brand-700 inline-flex items-center gap-2"><LogIn size={14} /> Se connecter</Link>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-8 max-w-7xl animate-pulse">
        <div className="h-8 w-64 bg-paper-200 rounded-sm mb-3" />
        <div className="h-4 w-48 bg-paper-100 rounded-sm mb-8" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-20 bg-paper-100 rounded-sm" />)}</div>
        {msg && <p className="mt-6 text-sm text-danger-500">{msg.t}</p>}
      </div>
    );

  const c = data.compteurs;
  const heure = new Date().getHours();
  const prenom = data.utilisateur.nom.split(/\s+/)[0];
  const peutPlanifier = data.utilisateur.role === "admin" || data.utilisateur.role === "saisie";
  const dateLongue = new Date(`${data.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Agenda groupé par jour
  const jours: Record<string, MaJourneeData["agenda"]> = {};
  for (const e of data.agenda) {
    const d = new Date(e.debut);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    (jours[cle] ||= []).push(e);
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-5 sm:py-7 max-w-7xl">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900">{heure < 18 ? "Bonjour" : "Bonsoir"} {prenom}</h1>
          <p className="text-sm text-ink-500 mt-1 first-letter:uppercase">
            {dateLongue} ·{" "}
            {c.taches + c.planning_assigne === 0 ? "rien d'urgent aujourd'hui" : `${data.a_faire.length} élément${data.a_faire.length > 1 ? "s" : ""} à traiter`}
            {c.en_retard > 0 && <span className="text-danger-500 font-medium">, dont {c.en_retard} en retard</span>}
          </p>
        </div>
        <Link href="/briefing" className="text-xs px-3 py-2 rounded-sm border border-paper-200 bg-white hover:border-brand-500 inline-flex items-center gap-2 text-ink-700">
          <Headphones size={14} className="text-brand-500" /> {data.briefing ? "Écouter le briefing du jour" : "Générer mon briefing audio"}
        </Link>
      </div>

      {msg && (
        <div className={cn("mb-4 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      {/* Compteurs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Tuile href="/taches" icon={ClipboardList} l="Tâches à traiter" v={c.taches} sub={c.en_retard ? `${c.en_retard} en retard` : c.envoyees_en_attente ? `${c.envoyees_en_attente} envoyée(s) en attente` : undefined} alerte={c.en_retard > 0} />
        <Tuile href="/documents" icon={FileSignature} l="Documents à signer" v={c.a_signer} alerte={c.a_signer > 0} accent="warn" />
        <Tuile href="/agenda" icon={CalendarDays} l="Rendez-vous aujourd'hui" v={c.rdv_aujourdhui} />
        <Tuile href="#a-venir" icon={Diamond} l="Jalons sous 30 jours" v={c.jalons_30j} />
        <Tuile href="#a-faire" icon={GanttChartSquare} l="Tâches de planning" v={c.planning_assigne}
          sub={c.planning_assigne ? `${data.a_faire.filter((x) => x.kind === "planning").length} dans les 15 jours` : "qui me sont assignées"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* À faire */}
        <section id="a-faire" className="lg:col-span-2 rounded-sm border border-paper-200 bg-white self-start scroll-mt-20">
          <div className="px-4 sm:px-5 py-3 border-b border-paper-200 flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-widest text-ink-700 font-semibold">À faire</h2>
            <Link href="/taches" className="text-[11px] text-brand-500 hover:underline">Toutes mes tâches →</Link>
          </div>
          {data.a_faire.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Sparkles size={22} className="mx-auto text-ok-500 mb-2" />
              <p className="text-sm text-ink-700">Rien à traiter pour le moment.</p>
              <p className="text-xs text-ink-500 mt-1">Les demandes de validation, de signature et vos tâches de planning apparaîtront ici.</p>
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {data.a_faire.map((x) => (
                <LigneAFaire key={`${x.kind}${x.id}`} x={x} occupe={enCours === `${x.kind}${x.id}`} peutPlanifier={peutPlanifier} agir={agir} />
              ))}
            </ul>
          )}
        </section>

        {/* Colonne de droite */}
        <div className="space-y-5">
          <section className="rounded-sm border border-paper-200 bg-white">
            <div className="px-4 py-3 border-b border-paper-200 flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-widest text-ink-700 font-semibold">Cette semaine</h2>
              <Link href="/agenda" className="text-[11px] text-brand-500 hover:underline">Agenda →</Link>
            </div>
            {Object.keys(jours).length === 0 && <p className="px-4 py-5 text-xs text-ink-500 italic">Aucun rendez-vous dans les 7 prochains jours.</p>}
            <div className="divide-y divide-paper-200">
              {Object.entries(jours).map(([cle, evts]) => {
                const q = quand(cle);
                return (
                  <div key={cle} className="px-4 py-2.5">
                    <div className={cn("text-[11px] font-semibold mb-1 first-letter:uppercase", q.t === "aujourd'hui" ? "text-brand-700" : "text-ink-500")}>
                      {q.t === "aujourd'hui" || q.t === "demain" ? q.t : new Date(`${cle}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}
                    </div>
                    {evts.map((e) => (
                      <Link key={e.id} href={`/agenda?date=${cle}`} className="flex items-start gap-2 py-1 group">
                        <span className="text-xs text-ink-500 tabular-nums w-11 shrink-0">{e.toute_journee ? "journée" : new Date(e.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="min-w-0">
                          <span className={cn("block text-sm group-hover:underline", e.moi ? "text-ink-900 font-medium" : "text-ink-700")}>{e.titre}</span>
                          {(e.lieu || e.operation_nom) && (
                            <span className="text-[11px] text-ink-500 inline-flex items-center gap-1">{e.lieu && <><MapPin size={10} /> {e.lieu}</>}{e.lieu && e.operation_nom ? " · " : ""}{e.operation_nom}</span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          <section id="a-venir" className="rounded-sm border border-paper-200 bg-white scroll-mt-20">
            <div className="px-4 py-3 border-b border-paper-200">
              <h2 className="text-[11px] uppercase tracking-widest text-ink-700 font-semibold">Jalons des 30 prochains jours</h2>
            </div>
            {data.jalons.length === 0 && <p className="px-4 py-5 text-xs text-ink-500 italic">Aucun jalon prévu.</p>}
            <ul className="divide-y divide-paper-200">
              {data.jalons.map((j) => (
                <li key={j.id}>
                  <Link href={j.url} className="px-4 py-2 flex items-center gap-3 hover:bg-paper-50">
                    <span className="w-2.5 h-2.5 rotate-45 bg-fuchsia-600 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink-900 truncate">{j.titre}</span>
                      <span className="text-[11px] text-ink-500">{j.operation_nom}</span>
                    </span>
                    <span className="text-xs text-ink-700 whitespace-nowrap">{quand(j.date).t}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Opérations */}
      <section className="mb-6">
        <h2 className="text-[11px] uppercase tracking-widest text-ink-700 font-semibold mb-3">Mes opérations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.operations.map((o) => (
            <div key={o.id} className="rounded-sm border border-paper-200 bg-white p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/operations/${o.id}`} className="font-serif text-lg text-ink-900 hover:underline truncate block">{o.nom}</Link>
                  <div className="text-xs text-ink-500">{o.commune} · {o.nb_logements} logements{o.phase_en_cours ? ` · ${o.phase_en_cours}` : ""}</div>
                </div>
                {(o.alertes.danger > 0 || o.alertes.warn > 0) && (
                  <Link href={`/operations/${o.id}/simulateur?onglet=synthese`} title="Points d'attention du montage financier"
                    className={cn("text-[11px] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1 shrink-0", o.alertes.danger ? "bg-danger-50 text-danger-500" : "bg-warn-50 text-warn-500")}>
                    <AlertTriangle size={11} /> {o.alertes.danger + o.alertes.warn}
                  </Link>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-paper-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${o.avancement}%` }} /></div>
                <span className="text-xs text-ink-700 w-9 text-right">{o.avancement} %</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-ink-500">Prochain jalon</dt>
                  <dd className="text-ink-900 truncate" title={o.prochain_jalon?.titre}>{o.prochain_jalon ? `${o.prochain_jalon.titre} · ${quand(o.prochain_jalon.date).t}` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Autofinancement an 1</dt>
                  <dd className={cn("tabular-nums", o.autofinancement_a1 === null ? "text-ink-500" : o.autofinancement_a1 < 0 ? "text-danger-500" : "text-ok-500")}>
                    {o.autofinancement_a1 === null ? "—" : eur(o.autofinancement_a1)}
                  </dd>
                </div>
              </dl>
              {o.en_retard > 0 && <div className="mt-2 text-[11px] text-danger-500">{o.en_retard} tâche(s) de planning en retard</div>}
              <div className="mt-auto pt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <Link href={`/operations/${o.id}`} className="text-brand-500 hover:underline">Tableau de bord</Link>
                <Link href={`/operations/${o.id}/projet?vue=gantt`} className="text-brand-500 hover:underline">Planning</Link>
                <Link href={`/operations/${o.id}/simulateur?onglet=synthese`} className="text-brand-500 hover:underline">Montage financier</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Activité */}
      <section className="rounded-sm border border-paper-200 bg-white">
        <div className="px-4 sm:px-5 py-3 border-b border-paper-200">
          <h2 className="text-[11px] uppercase tracking-widest text-ink-700 font-semibold">Activité récente</h2>
        </div>
        {data.activite.length === 0 && <p className="px-5 py-5 text-xs text-ink-500 italic">Pas encore d'activité.</p>}
        <ul className="divide-y divide-paper-200">
          {data.activite.map((a) => {
            const contenu = (
              <>
                <span className="w-6 h-6 rounded-full text-white text-[11px] font-semibold inline-flex items-center justify-center shrink-0" style={{ backgroundColor: couleurAvatar(a.user) }}>
                  {a.texte.startsWith("Vous") ? "•" : a.texte.split(" ").slice(0, 2).map((m) => m[0]).join("").toUpperCase()}
                </span>
                <span className="text-sm text-ink-700 flex-1 min-w-0">{a.texte}</span>
                <span className="text-[11px] text-ink-500 whitespace-nowrap">{ilYa(a.at)}</span>
              </>
            );
            return (
              <li key={a.id}>
                {a.url ? <Link href={a.url} className="px-4 sm:px-5 py-2.5 flex items-center gap-3 hover:bg-paper-50">{contenu}</Link> : <div className="px-4 sm:px-5 py-2.5 flex items-center gap-3">{contenu}</div>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Tuile({ href, icon: I, l, v, sub, alerte, accent }: { href: string; icon: typeof ClipboardList; l: string; v: number; sub?: string; alerte?: boolean; accent?: "warn" }) {
  return (
    <Link href={href} className={cn("rounded-sm border bg-white p-4 hover:border-brand-500 transition group", alerte ? (accent === "warn" ? "border-warn-500/50" : "border-danger-500/50") : "border-paper-200")}>
      <div className="text-[11px] uppercase tracking-widest text-ink-500 flex items-center gap-1.5"><I size={11} /> {l}</div>
      <div className={cn("font-serif text-3xl mt-1", alerte ? (accent === "warn" ? "text-warn-500" : "text-danger-500") : "text-ink-900")}>{v}</div>
      {sub && <div className={cn("text-[11px] mt-0.5", alerte ? "text-danger-500" : "text-ink-500")}>{sub}</div>}
    </Link>
  );
}

function LigneAFaire({
  x, occupe, peutPlanifier, agir,
}: {
  x: ElementAFaire;
  occupe: boolean;
  peutPlanifier: boolean;
  agir: (cle: string, fn: () => Promise<unknown>, texte: string) => void;
}) {
  const cle = `${x.kind}${x.id}`;
  const q = quand(x.echeance);
  const bouton = "text-xs px-2.5 py-1.5 rounded-sm inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40";
  const Icone = x.kind === "planning" ? (x.type === "jalon" ? Diamond : GanttChartSquare) : ICONES[x.type];

  return (
    <li className={cn("px-4 sm:px-5 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3", x.en_retard && "bg-danger-50/40")}>
      <span className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0",
        x.kind === "planning" ? "bg-paper-100 text-ink-700" : x.type === "signature" ? "bg-warn-50 text-warn-500" : x.type === "validation" ? "bg-ok-50 text-ok-500" : "bg-brand-50 text-brand-700")}>
        <Icone size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={x.url} className="text-sm text-ink-900 font-medium hover:underline leading-snug">{x.titre}</Link>
        <div className="text-[11px] text-ink-500 flex flex-wrap gap-x-2.5 mt-0.5">
          <span>{x.kind === "planning" ? (x.type === "jalon" ? "Jalon" : `Planning · ${x.avancement} %`) : `${LIBELLES_TYPE[x.type]} demandée par ${x.de}`}</span>
          {x.operation_nom && <span>{x.operation_nom}</span>}
          {x.kind === "tache" && x.document_titre && <span className="inline-flex items-center gap-0.5"><FileText size={10} /> {x.document_titre}</span>}
          <span className={cn(q.urgent && "text-danger-500 font-medium")}>{x.kind === "planning" && x.type === "tache" ? "fin " : ""}{q.t}</span>
          {x.priorite === "urgente" && <span className="text-danger-500 font-semibold uppercase">urgent</span>}
          {x.priorite === "haute" && <span className="text-warn-500 font-semibold uppercase">haute</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 ml-11 sm:ml-0">
        {x.kind === "tache" && x.type === "validation" && (
          <button disabled={occupe} onClick={() => agir(cle, () => collab.repondre(x.id, "validee", ""), `« ${x.titre} » validée — ${x.de} a été notifié(e).`)} className={cn(bouton, "bg-ok-500 text-white hover:opacity-90")}>
            <Check size={12} /> Valider
          </button>
        )}
        {x.kind === "tache" && x.type === "consultation" && (
          <>
            {x.document_id && <Link href={`/documents/${x.document_id}`} className={cn(bouton, "border border-paper-200 text-ink-700 hover:bg-paper-50")}><Eye size={12} /> Lire</Link>}
            <button disabled={occupe} onClick={() => agir(cle, () => collab.repondre(x.id, "consultee", ""), `Consultation confirmée — ${x.de} a été notifié(e).`)} className={cn(bouton, "bg-brand-500 text-white hover:bg-brand-700")}>
              <Check size={12} /> Consulté
            </button>
          </>
        )}
        {x.kind === "tache" && x.type === "signature" && x.document_id && (
          <Link href={`/documents/${x.document_id}?tache=${x.id}`} className={cn(bouton, "bg-warn-500 text-white hover:opacity-90")}><PenLine size={12} /> Signer</Link>
        )}
        {x.kind === "tache" && x.type === "autre" && (
          <button disabled={occupe} onClick={() => agir(cle, () => collab.repondre(x.id, "faite", ""), `« ${x.titre} » terminée — ${x.de} a été notifié(e).`)} className={cn(bouton, "bg-ok-500 text-white hover:opacity-90")}>
            <Check size={12} /> Fait
          </button>
        )}
        {x.kind === "planning" && peutPlanifier && x.type === "tache" && (
          <button disabled={occupe} onClick={() => agir(cle, () => projet.modifier(x.id, { statut: "termine" }), `« ${x.titre} » marquée terminée dans le planning.`)} className={cn(bouton, "border border-paper-200 text-ink-700 hover:bg-paper-50")}>
            <Check size={12} /> Terminé
          </button>
        )}
        <Link href={x.url} className={cn(bouton, "text-brand-500 hover:bg-brand-50")} title="Ouvrir">
          {x.kind === "planning" ? <GanttChartSquare size={12} /> : x.kind === "tache" && x.type === "validation" ? <Send size={12} /> : <ArrowRight size={12} />}
          <span className="hidden sm:inline">{x.kind === "tache" && x.type === "validation" ? "Détail / refuser" : "Ouvrir"}</span>
        </Link>
      </div>
    </li>
  );
}
