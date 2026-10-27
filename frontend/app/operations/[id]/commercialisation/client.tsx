"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, Save, Trash2, Upload, UserPlus, X } from "lucide-react";
import { Bouton, Modal, champ, champCourt, etiquette } from "@/components/collab/modal";
import { ImportModal } from "@/components/import-modal";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { telecharger } from "@/lib/collab";
import { cn, formatEuro, formatNumber, formatPct } from "@/lib/format";
import {
  LIBELLE_TRANCHE, LIBELLE_VERDICT, TRANCHES, brs,
  type EntreeMenage, type EtatBRS, type HypothesesBRS, type MenageBRS, type Resultat, type Tranche, type Verdict,
} from "@/lib/brs";

type Onglet = "menages" | "simulation" | "programme" | "hypotheses";

const MENAGE_VIDE: EntreeMenage = {
  reference: "", typologie: "T3", adultes: 2, enfants: 0, rfr_n2: 0, revenu_disponible_annuel: 0,
  revenus_nets_mensuels: 0, credits_mensuels: 0, apport: 0,
};

const COULEUR: Record<Verdict, string> = {
  financable: "border-ok-500/40 bg-ok-50 text-ok-500",
  a_retravailler: "border-warn-500/40 bg-warn-50 text-warn-500",
  non_eligible: "border-danger-500/40 bg-danger-50 text-danger-500",
  a_completer: "border-paper-200 bg-paper-50 text-ink-500",
};

export function Badge({ v }: { v: Verdict }) {
  return <span className={cn("inline-block text-[11px] font-medium px-1.5 py-0.5 rounded-sm border whitespace-nowrap", COULEUR[v])}>{LIBELLE_VERDICT[v]}</span>;
}

const lireNombre = (s: string) => Number(s.replace(/\s/g, "").replace(",", ".")) || 0;

/** Champ numérique saisi « à la française » ; en mode pourcentage, la valeur stockée est une fraction (0,035 → 3,5 %). */
function Nombre({ value, onChange, pct = false, suffixe, disabled, className, label }: {
  value: number | null; onChange: (v: number) => void; pct?: boolean; suffixe?: string; disabled?: boolean; className?: string; label: string;
}) {
  const affiche = (v: number | null) => (v === null || v === undefined ? "" : String(pct ? Math.round(v * 100000) / 1000 : v).replace(".", ","));
  const [texte, setTexte] = useState(affiche(value));
  useEffect(() => setTexte(affiche(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <input aria-label={label} inputMode="decimal" disabled={disabled} className={cn(champCourt, "w-full text-right tabular-nums min-w-0")} value={texte}
        onChange={(e) => { setTexte(e.target.value); onChange(pct ? lireNombre(e.target.value) / 100 : lireNombre(e.target.value)); }} />
      {(suffixe || pct) && <span className="text-xs text-ink-500 shrink-0">{pct ? "%" : suffixe}</span>}
    </span>
  );
}

function valeurEtape(v: number | string | null, unite: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (unite === "%") return formatPct(v * 100, 1);
  if (unite.startsWith("€")) return formatEuro(v) + (unite === "€/mois" ? " / mois" : unite === "€/an" ? " / an" : "");
  if (unite === "UC") return formatNumber(v, 2);
  if (unite === "m²") return `${formatNumber(v)} m²`;
  return formatNumber(v);
}

export function CommercialisationClient({ scenarioId }: { scenarioId: number }) {
  const [e, setE] = useState<EtatBRS | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("menages");
  const [role, setRole] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const dire = useCallback((ok: boolean, t: string) => setMsg({ ok, t }), []);
  const charger = useCallback(() => brs.lire(scenarioId).then(setE).catch((x) => dire(false, String(x.message || x))), [scenarioId, dire]);
  useEffect(() => {
    setRole(getUser()?.role ?? null);
    charger();
  }, [charger]);
  const peutSaisir = role === "admin" || role === "saisie";

  if (!e) return <div className="px-6 py-10 text-sm text-ink-500">{msg ? msg.t : "Chargement…"}</div>;
  const s = e.synthese;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500">Outils du montage · {e.scenario.operation_nom}</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Commercialisation BRS</h1>
          <p className="text-sm text-ink-500 mt-1 max-w-3xl">
            Éligibilité aux plafonds de ressources, subvention selon la tranche de déciles, coût mensuel du logement et solvabilité
            (taux d'effort HCSF, reste à vivre par unité de consommation).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {peutSaisir && <Bouton onClick={() => setImportOpen(true)}><Upload size={13} /> Importer des ménages</Bouton>}
          <Bouton onClick={() => telecharger(`/api/brs/scenario/${scenarioId}/export.xlsx`, "commercialisation_brs.xlsx").catch((x) => dire(false, String(x.message || x)))} variante="primaire">
            <Download size={13} /> Exporter (.xlsx)
          </Bouton>
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importer des ménages candidats (Excel)"
        description="Colonnes : reference, typologie, adultes, enfants, rfr_n2, revenu_disponible_annuel, revenus_nets_mensuels, credits_mensuels, apport."
        templateUrl="/api/imports/menages/template.xlsx"
        templateLabel="Télécharger le gabarit Excel"
        doImport={(f) => api.importMenagesExcel(scenarioId, f)}
        onSuccess={() => setTimeout(charger, 800)}
      />

      {msg && (
        <div className={cn("mb-4 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <Tuile label="Ménages candidats" value={String(e.menages.length)} />
        <Tuile label="Finançables" value={String(s.financable)} ton="ok" />
        <Tuile label="À retravailler" value={String(s.a_retravailler)} ton="warn" />
        <Tuile label="Non éligibles" value={String(s.non_eligible)} ton="danger" />
        <Tuile label="Logements BRS" value={String(e.programme.total.nb)} sub={`${formatEuro(e.programme.total.subvention)} de subventions`} />
      </div>

      <div className="inline-flex flex-wrap rounded-sm border border-paper-200 bg-white overflow-hidden mb-5">
        {([["menages", "Ménages candidats"], ["simulation", "Simuler un ménage"], ["programme", "Programme & subventions"], ["hypotheses", "Hypothèses"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setOnglet(k); setMsg(null); }} className={cn("px-4 py-1.5 text-sm", onglet === k ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-paper-50")}>{l}</button>
        ))}
      </div>

      {onglet === "menages" && <OngletMenages e={e} setE={setE} peutSaisir={peutSaisir} dire={dire} />}
      {onglet === "simulation" && <OngletSimulation e={e} setE={setE} peutSaisir={peutSaisir} dire={dire} />}
      {onglet === "programme" && <OngletProgramme e={e} setE={setE} peutSaisir={peutSaisir} dire={dire} />}
      {onglet === "hypotheses" && <OngletHypotheses e={e} setE={setE} peutSaisir={peutSaisir} dire={dire} />}
    </div>
  );
}

type Props = { e: EtatBRS; setE: (x: EtatBRS) => void; peutSaisir: boolean; dire: (ok: boolean, t: string) => void };

function Tuile({ label, value, sub, ton }: { label: string; value: string; sub?: string; ton?: "ok" | "warn" | "danger" }) {
  return (
    <div className="rounded-sm border border-paper-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-widest text-ink-500">{label}</div>
      <div className={cn("kpi-value text-xl mt-1 tabular-nums", ton === "ok" ? "text-ok-500" : ton === "warn" ? "text-warn-500" : ton === "danger" ? "text-danger-500" : "text-ink-900")}>{value}</div>
      {sub && <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ───────────────────────────────────────────── ménages candidats
function OngletMenages({ e, setE, peutSaisir, dire }: Props) {
  const [selId, setSelId] = useState<number | null>(e.menages[0]?.id ?? null);
  const [edition, setEdition] = useState<MenageBRS | "nouveau" | null>(null);
  const sel = e.menages.find((m) => m.id === selId) || null;

  const supprimer = async (m: MenageBRS) => {
    try {
      setE(await brs.supprimerMenage(m.id));
      setSelId(null);
      dire(true, `Ménage ${m.reference} supprimé.`);
    } catch (x) {
      dire(false, String((x as Error).message || x));
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 rounded-sm border border-paper-200 bg-white overflow-x-auto self-start">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-500 bg-paper-50">
                {["Réf.", "Typo", "Tranche", "Subvention", "Coût / mois", "Effort", "Reste / UC", "Verdict"].map((t, i) => (
                  <th key={t} className={cn("px-3 py-2 font-medium whitespace-nowrap", i >= 3 && i <= 6 ? "text-right" : "text-left")}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {e.menages.map((m) => {
                const r = m.resultat;
                return (
                  <tr key={m.id} onClick={() => setSelId(m.id)} className={cn("border-t border-paper-200 cursor-pointer hover:bg-paper-50 whitespace-nowrap", selId === m.id && "bg-brand-50/50")}>
                    <td className="px-3 py-2 font-mono text-xs text-ink-900">{m.reference}</td>
                    <td className="px-3 py-2">{r.typologie} <span className="text-[11px] text-ink-500">· {r.personnes} pers.</span></td>
                    <td className="px-3 py-2">{LIBELLE_TRANCHE[r.tranche]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEuro(r.subvention)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEuro(r.cout_mensuel)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.taux_effort !== null && r.taux_effort > r.taux_effort_max && "text-danger-500")}>
                      {r.taux_effort === null ? "—" : formatPct(r.taux_effort * 100)}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.reste_a_vivre_uc < r.reste_a_vivre_min_uc && "text-danger-500")}>{formatEuro(r.reste_a_vivre_uc)}</td>
                    <td className="px-3 py-2"><Badge v={r.verdict} /></td>
                  </tr>
                );
              })}
              {e.menages.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-sm text-ink-500 whitespace-normal">Aucun ménage candidat. Ajoutez-en un, importez un fichier Excel ou testez un profil dans « Simuler un ménage ».</td></tr>
              )}
            </tbody>
          </table>
          {peutSaisir && (
            <div className="border-t border-paper-200 p-3"><Bouton onClick={() => setEdition("nouveau")}><UserPlus size={13} /> Ajouter un ménage</Bouton></div>
          )}
        </div>
        <div className="xl:col-span-4">
          {sel ? (
            <Detail r={sel.resultat} titre={`Ménage ${sel.reference}`} notes={sel.notes}
              actions={peutSaisir && (
                <div className="flex gap-2">
                  <Bouton onClick={() => setEdition(sel)} variante="discret"><Pencil size={12} /> Modifier</Bouton>
                  <Bouton onClick={() => supprimer(sel)} variante="danger"><Trash2 size={12} /></Bouton>
                </div>
              )} />
          ) : (
            <div className="rounded-sm border border-paper-200 bg-white p-5 text-sm text-ink-500">Sélectionnez un ménage pour voir le détail du calcul.</div>
          )}
        </div>
      </div>

      <section className="rounded-sm border border-paper-200 bg-white overflow-x-auto">
        <div className="px-5 py-3 border-b border-paper-200">
          <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">Logements prévus et candidats par tranche</div>
          <p className="text-xs text-ink-500 mt-0.5">Répartition du programme face aux ménages candidats de chaque typologie et tranche de déciles.</p>
        </div>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-4 py-2 font-medium">Typologie</th>
              {TRANCHES.map((k) => <th key={k} className="text-right px-4 py-2 font-medium">{LIBELLE_TRANCHE[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {e.hypotheses.typologies.map((t) => (
              <tr key={t.code} className="border-t border-paper-200">
                <td className="px-4 py-2 font-medium">{t.code}</td>
                {TRANCHES.map((k) => {
                  const c = e.couverture.find((x) => x.typologie === t.code && x.tranche === k);
                  if (!c) return <td key={k} />;
                  return (
                    <td key={k} className="px-4 py-2 text-right tabular-nums">
                      <span className={cn(c.financables >= c.prevus && c.prevus > 0 ? "text-ok-500" : "text-ink-900")}>{c.financables}</span>
                      <span className="text-ink-500"> finançable{c.financables > 1 ? "s" : ""} / {c.prevus} prévu{c.prevus > 1 ? "s" : ""}</span>
                      {c.candidats > c.financables && <span className="text-ink-500 text-xs"> · {c.candidats} candidat{c.candidats > 1 ? "s" : ""}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {edition && (
        <EditionMenage e={e} menage={edition === "nouveau" ? null : edition} onClose={() => setEdition(null)}
          onSave={(x, ref) => { setE(x); setEdition(null); setSelId(x.menages.find((m) => m.reference === ref)?.id ?? null); dire(true, `Ménage ${ref} enregistré.`); }} />
      )}
    </div>
  );
}

function Detail({ r, titre, notes, actions }: { r: Resultat; titre: string; notes?: string; actions?: React.ReactNode }) {
  const sections = useMemo(() => Array.from(new Set(r.etapes.map((x) => x.section))), [r]);
  return (
    <div className="rounded-sm border border-paper-200 bg-white">
      <div className="px-5 py-4 border-b border-paper-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-500">{titre}</div>
            <div className="font-serif text-lg text-ink-900">Logement {r.typologie} · {LIBELLE_TRANCHE[r.tranche]}</div>
          </div>
          <Badge v={r.verdict} />
        </div>
        {r.motifs.length > 0 && <ul className="mt-2 text-xs text-ink-700 space-y-0.5">{r.motifs.map((m) => <li key={m}>· {m}</li>)}</ul>}
        {notes && <p className="mt-2 text-xs text-ink-500 whitespace-pre-line">{notes}</p>}
        {actions && <div className="mt-3">{actions}</div>}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {sections.map((s) => (
            <Fragment key={s}>
              <tr className="bg-paper-50"><td colSpan={2} className="px-5 py-1.5 text-[11px] uppercase tracking-widest text-ink-500 font-medium">{s}</td></tr>
              {r.etapes.filter((x) => x.section === s).map((x) => (
                <tr key={s + x.label} className="border-t border-paper-200">
                  <td className="px-5 py-1.5 text-ink-700">{x.label}</td>
                  <td className="px-5 py-1.5 text-right tabular-nums text-ink-900 font-medium whitespace-nowrap">{valeurEtape(x.valeur, x.unite)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormulaireMenage({ m, setM, typologies, avecReference = true }: { m: EntreeMenage; setM: (x: EntreeMenage) => void; typologies: string[]; avecReference?: boolean }) {
  const n = (k: keyof EntreeMenage, label: string, suffixe?: string) => (
    <div>
      <label className={etiquette}>{label}</label>
      <Nombre label={label} value={m[k] as number} onChange={(v) => setM({ ...m, [k]: v })} suffixe={suffixe} className="w-full" />
    </div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {avecReference && (
        <div><label className={etiquette} htmlFor="fm-ref">Référence</label><input id="fm-ref" className={champ} value={m.reference} onChange={(x) => setM({ ...m, reference: x.target.value })} /></div>
      )}
      <div>
        <label className={etiquette} htmlFor="fm-typo">Typologie choisie</label>
        <select id="fm-typo" className={champ} value={m.typologie} onChange={(x) => setM({ ...m, typologie: x.target.value })}>
          {typologies.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {n("adultes", "Adultes (≥ 14 ans, demandeur compris)")}
      {n("enfants", "Enfants de moins de 14 ans")}
      {n("rfr_n2", "Revenu fiscal de référence N-2", "€/an")}
      {n("revenu_disponible_annuel", "Revenu disponible annuel (pour le décile)", "€/an")}
      {n("revenus_nets_mensuels", "Revenus nets mensuels (taux d'effort)", "€/mois")}
      {n("credits_mensuels", "Charges de crédit en cours", "€/mois")}
      {n("apport", "Apport personnel", "€")}
    </div>
  );
}

function EditionMenage({ e, menage, onClose, onSave }: { e: EtatBRS; menage: MenageBRS | null; onClose: () => void; onSave: (x: EtatBRS, ref: string) => void }) {
  const [m, setM] = useState<EntreeMenage>(menage ? { ...menage } : { ...MENAGE_VIDE, reference: `M-${String(e.menages.length + 1).padStart(3, "0")}` });
  const [notes, setNotes] = useState(menage?.notes || "");
  const [err, setErr] = useState<string | null>(null);
  const valider = async () => {
    try {
      const x = menage ? await brs.modifierMenage(menage.id, { ...m, notes }) : await brs.ajouterMenage(e.scenario.id, { ...m, notes });
      onSave(x, m.reference);
    } catch (x) {
      setErr(String((x as Error).message || x));
    }
  };
  return (
    <Modal titre={menage ? `Modifier le ménage ${menage.reference}` : "Ajouter un ménage candidat"} onClose={onClose} large
      pied={<><Bouton onClick={onClose} variante="discret">Annuler</Bouton><Bouton onClick={valider} variante="primaire"><Save size={12} /> Enregistrer</Bouton></>}>
      <FormulaireMenage m={m} setM={setM} typologies={e.hypotheses.typologies.map((t) => t.code)} />
      <div className="mt-3"><label className={etiquette} htmlFor="fm-notes">Notes</label><textarea id="fm-notes" className={champ} rows={2} value={notes} onChange={(x) => setNotes(x.target.value)} /></div>
      {err && <div className="mt-3 text-sm text-danger-500">{err}</div>}
    </Modal>
  );
}

// ───────────────────────────────────────────── simulation
function OngletSimulation({ e, setE, peutSaisir, dire }: Props) {
  const [m, setM] = useState<EntreeMenage>({ ...MENAGE_VIDE, reference: "SIMULATION", adultes: 2, enfants: 1, rfr_n2: 42000, revenu_disponible_annuel: 38000, revenus_nets_mensuels: 3200, apport: 15000 });
  const [r, setR] = useState<Resultat | null>(null);
  useEffect(() => {
    const t = setTimeout(() => brs.simuler(e.scenario.id, m).then(setR).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [m, e.scenario.id, e.hypotheses]);
  const enregistrer = async () => {
    const ref = m.reference === "SIMULATION" ? `M-${String(e.menages.length + 1).padStart(3, "0")}` : m.reference;
    try {
      setE(await brs.ajouterMenage(e.scenario.id, { ...m, reference: ref }));
      dire(true, `Ménage ${ref} ajouté aux candidats.`);
    } catch (x) {
      dire(false, String((x as Error).message || x));
    }
  };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-5 rounded-sm border border-paper-200 bg-white p-5 self-start">
        <p className="text-xs text-ink-500 mb-4">Le résultat se met à jour à chaque saisie, avec les hypothèses de l'opération. Rien n'est enregistré tant que vous ne l'ajoutez pas aux candidats.</p>
        <FormulaireMenage m={m} setM={setM} typologies={e.hypotheses.typologies.map((t) => t.code)} />
        {peutSaisir && <div className="mt-4"><Bouton onClick={enregistrer}><Plus size={12} /> Ajouter aux ménages candidats</Bouton></div>}
      </div>
      <div className="xl:col-span-7">{r ? <Detail r={r} titre="Simulation" /> : <div className="text-sm text-ink-500">Calcul…</div>}</div>
    </div>
  );
}

// ───────────────────────────────────────────── programme & subventions
function OngletProgramme({ e, setE, peutSaisir, dire }: Props) {
  const [rep, setRep] = useState(e.hypotheses.typologies.map((t) => ({ ...t.repartition })));
  const modifie = rep.some((r, i) => TRANCHES.some((k) => r[k] !== e.hypotheses.typologies[i].repartition[k]));
  const p = e.programme;
  const enregistrer = async () => {
    try {
      const x = await brs.enregistrerHypotheses(e.scenario.id, { ...e.hypotheses, typologies: e.hypotheses.typologies.map((t, i) => ({ ...t, repartition: rep[i] })) });
      setE(x);
      setRep(x.hypotheses.typologies.map((t) => ({ ...t.repartition })));
      dire(true, "Répartition enregistrée.");
    } catch (x) {
      dire(false, String((x as Error).message || x));
    }
  };
  return (
    <div className="rounded-sm border border-paper-200 bg-white overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-widest text-ink-500 bg-paper-50">
            <th className="text-left px-4 py-2 font-medium">Typologie</th>
            <th className="text-right px-4 py-2 font-medium">Nb lgts</th>
            {TRANCHES.map((k) => <th key={k} className="text-right px-4 py-2 font-medium">{LIBELLE_TRANCHE[k]}</th>)}
            <th className="text-left px-4 py-2 font-medium">Contrôle</th>
            <th className="text-right px-4 py-2 font-medium">Subv. totale</th>
            <th className="text-right px-4 py-2 font-medium">Prix brut total</th>
            <th className="text-right px-4 py-2 font-medium">Prix net total</th>
          </tr>
        </thead>
        <tbody>
          {p.lignes.map((l, i) => {
            const ecart = TRANCHES.reduce((a, k) => a + (rep[i]?.[k] || 0), 0) - l.nb;
            return (
              <tr key={l.code} className="border-t border-paper-200">
                <td className="px-4 py-2 font-medium">{l.code}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.nb}</td>
                {TRANCHES.map((k) => (
                  <td key={k} className="px-4 py-1.5 text-right">
                    {peutSaisir ? (
                      <input aria-label={`${l.code} ${LIBELLE_TRANCHE[k]}`} inputMode="numeric" className={cn(champCourt, "w-16 text-right tabular-nums")}
                        value={rep[i]?.[k] ?? 0} onChange={(x) => setRep(rep.map((r, j) => (j === i ? { ...r, [k]: Math.max(0, Math.round(lireNombre(x.target.value))) } : r)))} />
                    ) : <span className="tabular-nums">{l.repartition[k]}</span>}
                  </td>
                ))}
                <td className={cn("px-4 py-2 text-xs font-medium", ecart === 0 ? "text-ok-500" : "text-danger-500")}>{ecart === 0 ? "OK" : `Écart ${ecart > 0 ? "+" : ""}${ecart}`}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatEuro(l.subvention)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatEuro(l.prix_brut)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatEuro(l.prix_net)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-paper-200 bg-paper-50 font-medium">
            <td className="px-4 py-2">Total</td>
            <td className="px-4 py-2 text-right tabular-nums">{p.total.nb}</td>
            {TRANCHES.map((k) => <td key={k} className="px-4 py-2 text-right tabular-nums">{p.total[k]}</td>)}
            <td />
            <td className="px-4 py-2 text-right tabular-nums">{formatEuro(p.total.subvention)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatEuro(p.total.prix_brut)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatEuro(p.total.prix_net)}</td>
          </tr>
          {(["quotites_reelles", "quotites_cibles"] as const).map((q) => (
            <tr key={q} className="border-t border-paper-200 text-ink-700">
              <td className="px-4 py-2" colSpan={2}>{q === "quotites_reelles" ? "Quotité réelle" : "Quotité cible"}</td>
              {TRANCHES.map((k) => (
                <td key={k} className={cn("px-4 py-2 text-right tabular-nums", q === "quotites_reelles" && Math.abs(p.quotites_reelles[k] - p.quotites_cibles[k]) > 0.05 && "text-warn-500")}>
                  {formatPct(p[q][k] * 100)}
                </td>
              ))}
              <td colSpan={4} />
            </tr>
          ))}
          <tr className="border-t border-paper-200">
            <td className="px-4 py-2 text-ink-700" colSpan={6}>Subvention moyenne par logement</td>
            <td className="px-4 py-2 text-right tabular-nums font-medium">{formatEuro(p.subvention_moyenne)}</td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      {peutSaisir && (
        <div className="px-4 py-3 border-t border-paper-200 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-500">Les quotités cibles et le nombre de logements se règlent dans « Hypothèses ».</span>
          <Bouton onClick={enregistrer} variante="primaire" disabled={!modifie}><Save size={12} /> Enregistrer la répartition</Bouton>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── hypothèses
function OngletHypotheses({ e, setE, peutSaisir, dire }: Props) {
  const [h, setH] = useState<HypothesesBRS>(structuredClone(e.hypotheses));
  const ro = !peutSaisir;
  const set = <K extends keyof HypothesesBRS>(k: K, v: HypothesesBRS[K]) => setH({ ...h, [k]: v });
  const typo = (i: number, patch: Partial<HypothesesBRS["typologies"][number]>) => set("typologies", h.typologies.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const enregistrer = async () => {
    try {
      const x = await brs.enregistrerHypotheses(e.scenario.id, h);
      setE(x);
      setH(structuredClone(x.hypotheses));
      dire(true, "Hypothèses enregistrées : les ménages et le programme sont recalculés.");
    } catch (x) {
      dire(false, String((x as Error).message || x));
    }
  };
  const param = (k: keyof HypothesesBRS, label: string, opts: { pct?: boolean; suffixe?: string; note?: string } = {}) => (
    <div className="grid grid-cols-[1fr_9rem] items-center gap-3 py-1.5 border-t border-paper-200 first:border-t-0">
      <div className="text-sm text-ink-700">{label}{opts.note && <div className="text-[11px] text-ink-500">{opts.note}</div>}</div>
      <Nombre label={label} value={h[k] as number} onChange={(v) => set(k, v as never)} pct={opts.pct} suffixe={opts.suffixe} disabled={ro} />
    </div>
  );
  return (
    <div className="space-y-5">
      <section className="rounded-sm border border-paper-200 bg-white overflow-x-auto">
        <div className="px-5 py-3 border-b border-paper-200 text-[11px] uppercase tracking-widest text-ink-500 font-medium">Typologies</div>
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-[11px] text-ink-500 bg-paper-50">
              {["Typologie", "Surface habitable", "Prix de vente BRS TTC", "Nb logements", "Subv. déciles 3-4", "Subv. déciles 5-6", "Subv. déciles 7-9", ""].map((t) => (
                <th key={t} className="text-left px-3 py-2 font-medium">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.typologies.map((t, i) => (
              <tr key={i} className="border-t border-paper-200">
                <td className="px-3 py-1.5"><input aria-label="Code typologie" disabled={ro} className={cn(champCourt, "w-16")} value={t.code} onChange={(x) => typo(i, { code: x.target.value })} /></td>
                <td className="px-3 py-1.5"><Nombre label="Surface" value={t.surface} onChange={(v) => typo(i, { surface: v })} suffixe="m²" disabled={ro} className="w-28" /></td>
                <td className="px-3 py-1.5"><Nombre label="Prix" value={t.prix_ttc} onChange={(v) => typo(i, { prix_ttc: v })} suffixe="€" disabled={ro} className="w-36" /></td>
                <td className="px-3 py-1.5"><Nombre label="Nombre de logements" value={t.nb} onChange={(v) => typo(i, { nb: Math.round(v) })} disabled={ro} className="w-16" /></td>
                {TRANCHES.map((k: Tranche) => (
                  <td key={k} className="px-3 py-1.5"><Nombre label={`Subvention ${k}`} value={t.subventions[k]} onChange={(v) => typo(i, { subventions: { ...t.subventions, [k]: v } })} suffixe="€" disabled={ro} className="w-28" /></td>
                ))}
                <td className="px-3 py-1.5">
                  {!ro && <button onClick={() => set("typologies", h.typologies.filter((_, j) => j !== i))} className="p-1 text-ink-500 hover:text-danger-500" aria-label="Supprimer la typologie"><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ro && (
          <div className="px-5 py-3 border-t border-paper-200">
            <Bouton onClick={() => set("typologies", [...h.typologies, { code: `T${h.typologies.length + 2}`, surface: 0, prix_ttc: 0, nb: 0, subventions: { "3-4": 0, "5-6": 0, "7-9": 0 }, repartition: { "3-4": 0, "5-6": 0, "7-9": 0 } }])}>
              <Plus size={12} /> Ajouter une typologie
            </Bouton>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-sm border border-paper-200 bg-white px-5 py-3">
          <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium mb-2">Paramètres financiers</div>
          {param("redevance_m2_mois", "Redevance foncière", { suffixe: "€/m²/mois" })}
          {param("charges_m2_mois", "Charges de copropriété", { suffixe: "€/m²/mois" })}
          {param("taxe_fonciere_an", "Taxe foncière annuelle estimée", { suffixe: "€", note: "Abattement communal possible jusqu'à 30 % en BRS" })}
          {param("taux_pret", "Taux du prêt (hors assurance)", { pct: true })}
          {param("taux_assurance", "Taux assurance emprunteur (annuel, sur capital)", { pct: true, note: "Écart possible selon profil et banque" })}
          {param("duree_ans", "Durée du prêt", { suffixe: "ans" })}
          {param("frais_acquisition", "Frais d'acquisition (% du prix)", { pct: true, note: "Frais réduits en BRS, à confirmer par le notaire" })}
          {param("taux_effort_max", "Taux d'effort maximal (HCSF)", { pct: true })}
          {param("reste_a_vivre_min_uc", "Reste à vivre minimum par UC", { suffixe: "€/mois" })}
        </section>

        <div className="space-y-5">
          <section className="rounded-sm border border-paper-200 bg-white px-5 py-3">
            <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">Plafonds de ressources BRS (revenu fiscal de référence N-2)</div>
            <div className="grid grid-cols-1 gap-2 my-2">
              <input aria-label="Zone" disabled={ro} className={champ} value={h.plafonds.zone} onChange={(x) => set("plafonds", { ...h.plafonds, zone: x.target.value })} />
              <input aria-label="Source" disabled={ro} className={champ} value={h.plafonds.source} onChange={(x) => set("plafonds", { ...h.plafonds, source: x.target.value })} />
            </div>
            <p className="text-[11px] text-warn-500 mb-1">Valeurs à vérifier et à mettre à jour selon l'arrêté en vigueur et la zone de l'opération.</p>
            {["1 personne", "2 personnes", "3 personnes", "4 personnes", "5 personnes et +"].map((l, i) => (
              <div key={l} className="grid grid-cols-[1fr_9rem] items-center gap-3 py-1.5 border-t border-paper-200">
                <div className="text-sm text-ink-700">{l}</div>
                <Nombre label={`Plafond ${l}`} value={h.plafonds.montants[i] ?? null} disabled={ro} suffixe="€"
                  onChange={(v) => set("plafonds", { ...h.plafonds, montants: h.plafonds.montants.map((x, j) => (j === i ? v || null : x)) })} />
              </div>
            ))}
          </section>

          <section className="rounded-sm border border-paper-200 bg-white px-5 py-3">
            <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">Déciles de revenu disponible par UC</div>
            <input aria-label="Source des déciles" disabled={ro} className={cn(champ, "my-2")} value={h.deciles.source} onChange={(x) => set("deciles", { ...h.deciles, source: x.target.value })} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["D3", "D4", "D5", "D6", "D7", "D8", "D9"] as const).map((d) => (
                <div key={d}>
                  <label className={etiquette}>{d}{d === "D5" ? " (médiane)" : ""}</label>
                  <Nombre label={d} value={h.deciles[d]} onChange={(v) => set("deciles", { ...h.deciles, [d]: v })} suffixe="€" disabled={ro} />
                </div>
              ))}
            </div>
            <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium mt-4 mb-1">Quotités cibles</div>
            <div className="grid grid-cols-3 gap-2">
              {TRANCHES.map((k) => (
                <div key={k}>
                  <label className={etiquette}>{LIBELLE_TRANCHE[k]}</label>
                  <Nombre label={`Quotité ${k}`} value={h.quotites_cibles[k]} pct onChange={(v) => set("quotites_cibles", { ...h.quotites_cibles, [k]: v })} disabled={ro} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {!ro && <div className="text-right"><Bouton onClick={enregistrer} variante="primaire"><Save size={12} /> Enregistrer les hypothèses</Bouton></div>}
    </div>
  );
}
