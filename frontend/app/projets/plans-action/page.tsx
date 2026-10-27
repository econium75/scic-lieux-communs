"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2, X } from "lucide-react";
import { Bouton, champ, champCourt } from "@/components/collab/modal";
import { collab, type Membre } from "@/lib/collab";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { STATUT_ACTION, euros, projets, type Action, type AnneeFonciere, type PlansAction, type StatutAction } from "@/lib/projets";

const COULEUR_STATUT: Record<StatutAction, string> = {
  a_lancer: "border-paper-200 text-ink-700 bg-white",
  en_cours: "border-brand-500/40 text-brand-700 bg-brand-50",
  fait: "border-ok-500/40 text-ok-500 bg-ok-50",
};

const entier = (s: string) => Math.max(0, Math.round(Number(s.replace(/\s/g, "").replace(",", ".")) || 0));

export default function PlansActionPage() {
  const [plans, setPlans] = useState<PlansAction | null>(null);
  const [initial, setInitial] = useState("");
  const [membres, setMembres] = useState<Membre[]>([]);
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [nouvelAxe, setNouvelAxe] = useState("");

  const charger = useCallback(() => {
    projets.plansAction().then((p) => { setPlans(p); setInitial(JSON.stringify(p)); }).catch((e) => setMsg({ ok: false, t: String(e.message || e) }));
  }, []);
  useEffect(() => {
    const u = getUser();
    setRole(u?.role ?? null);
    if (u) {
      charger();
      collab.annuaire().then(setMembres).catch(() => {});
    }
  }, [charger]);

  const axes = useMemo(() => Array.from(new Set((plans?.actions || []).map((a) => a.axe))), [plans]);
  if (role === null) return <div className="px-6 py-10 text-sm text-ink-700"><Link href="/login" className="text-brand-500 hover:underline">Connectez-vous</Link> pour voir les plans d'action.</div>;
  if (!plans) return <div className="px-6 py-10 text-sm text-ink-500">{msg ? msg.t : "Chargement…"}</div>;

  const ro = !(role === "admin" || role === "saisie");
  const modifie = JSON.stringify(plans) !== initial;
  const majAction = (id: string, patch: Partial<Action>) => setPlans({ ...plans, actions: plans.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const ajouter = (axe: string) =>
    setPlans({ ...plans, actions: [...plans.actions, { id: `n${Date.now()}`, axe, titre: "Nouvelle action", detail: "", statut: "a_lancer", responsable: "", echeance: null }] });
  const f = plans.fonciere;
  const majAnnee = (i: number, patch: Partial<AnneeFonciere>) => setPlans({ ...plans, fonciere: { ...f, annees: f.annees.map((a, j) => (j === i ? { ...a, ...patch } : a)) } });
  const tot = f.annees.reduce((t, a) => ({ projets: t.projets + a.idf_projets + a.hors_idf_projets, logements: t.logements + a.idf_logements + a.hors_idf_logements }), { projets: 0, logements: 0 });
  const fondsPropres = (logements: number) => logements * f.cout_moyen_logement * f.taux_fonds_propres;

  const enregistrer = async () => {
    try {
      const p = await projets.enregistrerPlansAction(plans);
      setPlans(p);
      setInitial(JSON.stringify(p));
      setMsg({ ok: true, t: "Plans d'action enregistrés." });
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    }
  };

  const nb = (v: number, onChange: (n: number) => void, label: string, w = "w-16") =>
    ro ? <span className="tabular-nums">{v}</span> : (
      <input aria-label={label} inputMode="numeric" className={cn(champCourt, w, "text-right tabular-nums")} value={v} onChange={(e) => onChange(entier(e.target.value))} />
    );

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-7xl">
      <Link href="/projets" className="text-[11px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><ArrowLeft size={11} /> Suivi des projets</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-1 mb-5">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900">Plans d'action</h1>
          <p className="text-sm text-ink-500 mt-1">Axes de développement de la SCIC et modélisation de la foncière sur les cinq prochaines années.</p>
        </div>
        {!ro && <Bouton onClick={enregistrer} variante="primaire" disabled={!modifie}><Save size={12} /> Enregistrer</Bouton>}
      </div>

      {msg && (
        <div className={cn("mb-4 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5 max-w-xl">
        {(Object.keys(STATUT_ACTION) as StatutAction[]).map((k) => (
          <div key={k} className="rounded-sm border border-paper-200 bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-widest text-ink-500">{STATUT_ACTION[k]}</div>
            <div className="kpi-value text-xl text-ink-900 mt-1 tabular-nums">{plans.actions.filter((a) => a.statut === k).length}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4 mb-8">
        {axes.map((axe) => (
          <section key={axe} className="rounded-sm border border-paper-200 bg-white">
            <div className="px-5 py-2.5 border-b border-paper-200 flex items-center justify-between gap-3 bg-paper-50">
              <span className="text-[11px] uppercase tracking-widest text-ink-700 font-medium">{axe}</span>
              {!ro && <button onClick={() => ajouter(axe)} className="text-xs text-brand-500 hover:underline inline-flex items-center gap-1"><Plus size={12} /> Action</button>}
            </div>
            <ul>
              {plans.actions.filter((a) => a.axe === axe).map((a) => (
                <li key={a.id} className="px-5 py-3 border-t border-paper-200 first:border-t-0 grid grid-cols-1 lg:grid-cols-[8.5rem_1fr_12rem_9.5rem_2rem] gap-2 items-start">
                  {ro ? (
                    <span className={cn("text-[11px] font-medium px-2 py-1 rounded-sm border w-fit", COULEUR_STATUT[a.statut])}>{STATUT_ACTION[a.statut]}</span>
                  ) : (
                    <select aria-label="Statut" className={cn(champCourt, "text-xs", COULEUR_STATUT[a.statut])} value={a.statut} onChange={(e) => majAction(a.id, { statut: e.target.value as StatutAction })}>
                      {(Object.keys(STATUT_ACTION) as StatutAction[]).map((k) => <option key={k} value={k}>{STATUT_ACTION[k]}</option>)}
                    </select>
                  )}
                  <div className="min-w-0">
                    {ro ? <div className={cn("text-sm text-ink-900", a.statut === "fait" && "line-through text-ink-500")}>{a.titre}</div> : (
                      <input aria-label="Action" className={champ} value={a.titre} onChange={(e) => majAction(a.id, { titre: e.target.value })} />
                    )}
                    {ro ? (a.detail && <div className="text-xs text-ink-500 mt-0.5">{a.detail}</div>) : (
                      <input aria-label="Précisions" placeholder="Précisions (facultatif)" className={cn(champ, "mt-1 text-xs")} value={a.detail} onChange={(e) => majAction(a.id, { detail: e.target.value })} />
                    )}
                  </div>
                  {ro ? <span className="text-sm text-ink-700">{membres.find((m) => m.username === a.responsable)?.nom_affichage || "—"}</span> : (
                    <select aria-label="Responsable" className={champ} value={a.responsable} onChange={(e) => majAction(a.id, { responsable: e.target.value })}>
                      <option value="">Responsable…</option>
                      {membres.map((m) => <option key={m.username} value={m.username}>{m.nom_affichage}</option>)}
                    </select>
                  )}
                  {ro ? <span className="text-sm text-ink-700">{a.echeance ? new Date(a.echeance).toLocaleDateString("fr-FR") : "—"}</span> : (
                    <input aria-label="Échéance" type="date" className={champ} value={a.echeance || ""} onChange={(e) => majAction(a.id, { echeance: e.target.value || null })} />
                  )}
                  {!ro && <button onClick={() => setPlans({ ...plans, actions: plans.actions.filter((x) => x.id !== a.id) })} className="p-1.5 text-ink-500 hover:text-danger-500" aria-label="Supprimer l'action"><Trash2 size={14} /></button>}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!ro && (
          <div className="flex items-center gap-2">
            <input aria-label="Nouvel axe" placeholder="Nouvel axe (ex. Partenariats)" className={cn(champCourt, "w-64")} value={nouvelAxe} onChange={(e) => setNouvelAxe(e.target.value)} />
            <Bouton onClick={() => { if (nouvelAxe.trim()) { ajouter(nouvelAxe.trim()); setNouvelAxe(""); } }} disabled={!nouvelAxe.trim()}><Plus size={12} /> Ajouter un axe</Bouton>
          </div>
        )}
      </div>

      <section className="rounded-sm border border-paper-200 bg-white overflow-x-auto">
        <div className="px-5 py-3 border-b border-paper-200 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">Modélisation de la foncière</div>
            <p className="text-xs text-ink-500 mt-0.5">Opérations à lancer en Île-de-France et hors Île-de-France ; fonds propres à mobiliser selon le coût moyen d'un logement.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-700">
            <label className="inline-flex items-center gap-1.5">Fonds propres
              {ro ? <b>{Math.round(f.taux_fonds_propres * 100)} %</b> : (
                <><input aria-label="Taux de fonds propres" inputMode="decimal" className={cn(champCourt, "w-14 text-right")} value={Math.round(f.taux_fonds_propres * 1000) / 10}
                  onChange={(e) => setPlans({ ...plans, fonciere: { ...f, taux_fonds_propres: (Number(e.target.value.replace(",", ".")) || 0) / 100 } })} /> %</>
              )}
            </label>
            <label className="inline-flex items-center gap-1.5">Coût moyen d'un logement
              {ro ? <b>{f.cout_moyen_logement ? euros(f.cout_moyen_logement) : "à saisir"}</b> : (
                <><input aria-label="Coût moyen d'un logement" inputMode="numeric" className={cn(champCourt, "w-28 text-right")} value={f.cout_moyen_logement || ""} placeholder="à saisir"
                  onChange={(e) => setPlans({ ...plans, fonciere: { ...f, cout_moyen_logement: entier(e.target.value) } })} /> €</>
              )}
            </label>
          </div>
        </div>
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-4 py-2 font-medium">Année</th>
              <th className="text-right px-3 py-2 font-medium">IDF · projets</th>
              <th className="text-right px-3 py-2 font-medium">IDF · logements</th>
              <th className="text-left px-3 py-2 font-medium">IDF · précisions</th>
              <th className="text-right px-3 py-2 font-medium">Hors IDF · projets</th>
              <th className="text-right px-3 py-2 font-medium">Hors IDF · logements</th>
              <th className="text-right px-3 py-2 font-medium">Total projets</th>
              <th className="text-right px-3 py-2 font-medium">Fonds propres</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {f.annees.map((a, i) => {
              const logements = a.idf_logements + a.hors_idf_logements;
              return (
                <tr key={a.annee} className="border-t border-paper-200">
                  <td className="px-4 py-1.5 font-medium tabular-nums">{a.annee}</td>
                  <td className="px-3 py-1.5 text-right">{nb(a.idf_projets, (n) => majAnnee(i, { idf_projets: n }), `${a.annee} projets IDF`)}</td>
                  <td className="px-3 py-1.5 text-right">{nb(a.idf_logements, (n) => majAnnee(i, { idf_logements: n }), `${a.annee} logements IDF`, "w-20")}</td>
                  <td className="px-3 py-1.5">
                    {ro ? <span className="text-ink-700">{a.idf_detail}</span> : (
                      <input aria-label={`${a.annee} précisions`} className={cn(champ, "min-w-[16rem]")} value={a.idf_detail} onChange={(e) => majAnnee(i, { idf_detail: e.target.value })} />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">{nb(a.hors_idf_projets, (n) => majAnnee(i, { hors_idf_projets: n }), `${a.annee} projets hors IDF`)}</td>
                  <td className="px-3 py-1.5 text-right">{nb(a.hors_idf_logements, (n) => majAnnee(i, { hors_idf_logements: n }), `${a.annee} logements hors IDF`, "w-20")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{a.idf_projets + a.hors_idf_projets}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {f.cout_moyen_logement && logements ? euros(fondsPropres(logements)) : <span className="text-ink-300">{logements ? "coût à saisir" : "logements à estimer"}</span>}
                  </td>
                  <td className="px-2">
                    {!ro && <button onClick={() => setPlans({ ...plans, fonciere: { ...f, annees: f.annees.filter((_, j) => j !== i) } })} className="p-1 text-ink-500 hover:text-danger-500" aria-label={`Supprimer ${a.annee}`}><Trash2 size={13} /></button>}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-paper-200 bg-paper-50 font-medium">
              <td className="px-4 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{f.annees.reduce((t, a) => t + a.idf_projets, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{f.annees.reduce((t, a) => t + a.idf_logements, 0)}</td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums">{f.annees.reduce((t, a) => t + a.hors_idf_projets, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{f.annees.reduce((t, a) => t + a.hors_idf_logements, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{tot.projets}</td>
              <td className="px-3 py-2 text-right tabular-nums">{f.cout_moyen_logement && tot.logements ? euros(fondsPropres(tot.logements)) : "—"}</td>
              <td />
            </tr>
          </tbody>
        </table>
        {!ro && (
          <div className="px-5 py-3 border-t border-paper-200">
            <Bouton onClick={() => {
              const derniere = f.annees[f.annees.length - 1];
              setPlans({ ...plans, fonciere: { ...f, annees: [...f.annees, { annee: (derniere?.annee || new Date().getFullYear()) + 1, idf_projets: derniere?.idf_projets || 0, idf_logements: 0, idf_detail: "", hors_idf_projets: derniere?.hors_idf_projets || 0, hors_idf_logements: 0 }] } });
            }}><Plus size={12} /> Ajouter une année</Bouton>
          </div>
        )}
      </section>
    </div>
  );
}
