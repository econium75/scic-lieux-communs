"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Scenario } from "@/lib/types";
import { Save, RotateCcw } from "lucide-react";

type ExploitHyp = {
  loyer_annuel_initial?: number;
  taux_impayes_pct?: number;
  taux_evolution_loyers_pct?: number;
  frais_gestion_par_logement?: number;
  tfpb_par_logement?: number;
  duree_exoneration_tfpb_ans?: number;
  prets?: { nom: string; montant: number; taux_pct: number; duree_ans: number; differe_ans?: number }[];
};
type Ligne = { rubrique: string; poste: string; brs: number; pli: number; ratio_commentaire?: string };
type Vente = { volet: string; prix_vente_ht: number; nb_logements: number; shab_m2: number; sdp_m2: number };
type Subvention = { volet: string; source: string; montant: number };
type Hypotheses = {
  lignes?: Ligne[];
  ventes?: Vente[];
  subventions?: Subvention[];
  exploitation?: ExploitHyp;
};

export function ParametresClient({ opId, scenario }: { opId: number; scenario: Scenario }) {
  const router = useRouter();
  const [hyp, setHyp] = useState<Hypotheses>((scenario.hypotheses as Hypotheses) || {});
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const updateLigne = (idx: number, k: "brs" | "pli", v: number) => {
    const next = { ...hyp };
    if (!next.lignes) return;
    next.lignes = [...next.lignes];
    next.lignes[idx] = { ...next.lignes[idx], [k]: v };
    setHyp(next);
    setDirty(true);
  };

  const updateVente = (idx: number, k: keyof Vente, v: number) => {
    const next = { ...hyp };
    if (!next.ventes) return;
    next.ventes = [...next.ventes];
    next.ventes[idx] = { ...next.ventes[idx], [k]: v };
    setHyp(next);
    setDirty(true);
  };

  const updateSubvention = (idx: number, v: number) => {
    const next = { ...hyp };
    if (!next.subventions) return;
    next.subventions = [...next.subventions];
    next.subventions[idx] = { ...next.subventions[idx], montant: v };
    setHyp(next);
    setDirty(true);
  };

  const updateExploit = <K extends keyof ExploitHyp>(k: K, v: ExploitHyp[K]) => {
    const next = { ...hyp, exploitation: { ...(hyp.exploitation || {}), [k]: v } };
    setHyp(next);
    setDirty(true);
  };

  const updatePret = (idx: number, k: "montant" | "taux_pct" | "duree_ans", v: number) => {
    const next = { ...hyp };
    if (!next.exploitation?.prets) return;
    next.exploitation = {
      ...next.exploitation,
      prets: next.exploitation.prets.map((p, i) => (i === idx ? { ...p, [k]: v } : p)),
    };
    setHyp(next);
    setDirty(true);
  };

  const sauvegarder = () => {
    setMsg(null);
    startSaving(async () => {
      try {
        await api.updateHypotheses(scenario.id, hyp as Record<string, unknown>);
        setDirty(false);
        setMsg("Hypothèses sauvegardées. Les calculs sont réinitialisés.");
        setTimeout(() => router.refresh(), 500);
      } catch (e) {
        setMsg(`Erreur : ${e}`);
      }
    });
  };

  const annuler = () => {
    setHyp((scenario.hypotheses as Hypotheses) || {});
    setDirty(false);
    setMsg(null);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">M1 — Hypothèses du scénario</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Paramètres opération</h1>
          <p className="text-sm text-ink-500 mt-1">
            Édition des hypothèses du scénario <strong>{scenario.nom}</strong>. La sauvegarde invalide
            les calculs M2/M3 — ils seront recalculés au prochain affichage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={annuler}
              className="text-xs px-3 py-2 border border-ink-300 text-ink-700 rounded-sm hover:bg-paper-100 flex items-center gap-1.5"
            >
              <RotateCcw size={12} /> Annuler
            </button>
          )}
          <button
            onClick={sauvegarder}
            disabled={!dirty || saving}
            className="text-xs px-4 py-2 bg-brand-500 text-white rounded-sm hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={13} /> {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-sm border border-ok-500/40 bg-ok-50 px-4 py-2 text-sm text-ink-700 mb-4">
          {msg}
        </div>
      )}

      {/* M2 - Ventes */}
      <Section title="M2 — Prix de vente et volumétrie">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-4 py-2 font-medium">Volet</th>
              <th className="text-right px-4 py-2 font-medium">Nb lgts</th>
              <th className="text-right px-4 py-2 font-medium">SHAB m²</th>
              <th className="text-right px-4 py-2 font-medium">SDP m²</th>
              <th className="text-right px-4 py-2 font-medium">Prix de vente HT</th>
            </tr>
          </thead>
          <tbody>
            {hyp.ventes?.map((v, i) => (
              <tr key={i} className="border-t border-paper-200">
                <td className="px-4 py-1.5 text-ink-900 font-medium">{v.volet}</td>
                <td className="px-4 py-1.5"><NumInput value={v.nb_logements} onChange={(n) => updateVente(i, "nb_logements", n)} /></td>
                <td className="px-4 py-1.5"><NumInput value={v.shab_m2} onChange={(n) => updateVente(i, "shab_m2", n)} step={0.01} /></td>
                <td className="px-4 py-1.5"><NumInput value={v.sdp_m2} onChange={(n) => updateVente(i, "sdp_m2", n)} step={0.01} /></td>
                <td className="px-4 py-1.5"><NumInput value={v.prix_vente_ht} onChange={(n) => updateVente(i, "prix_vente_ht", n)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* M2 - Subventions */}
      <Section title="M2 — Subventions institutionnelles">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-4 py-2 font-medium">Volet</th>
              <th className="text-left px-4 py-2 font-medium">Source</th>
              <th className="text-right px-4 py-2 font-medium">Montant</th>
            </tr>
          </thead>
          <tbody>
            {hyp.subventions?.map((s, i) => (
              <tr key={i} className="border-t border-paper-200">
                <td className="px-4 py-1.5 text-ink-900 font-medium">{s.volet}</td>
                <td className="px-4 py-1.5 text-ink-700">{s.source}</td>
                <td className="px-4 py-1.5"><NumInput value={s.montant} onChange={(n) => updateSubvention(i, n)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* M2 - Lignes (compressed) */}
      <Section
        title={`M2 — Postes de dépenses (${hyp.lignes?.length || 0} lignes)`}
        subtitle="Modifier BRS / PLI de chaque poste"
      >
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-paper-50 z-10">
              <tr className="text-[10px] uppercase tracking-widest text-ink-500">
                <th className="text-left px-3 py-2 font-medium">Rubrique</th>
                <th className="text-left px-3 py-2 font-medium">Poste</th>
                <th className="text-right px-3 py-2 font-medium">BRS</th>
                <th className="text-right px-3 py-2 font-medium">PLI</th>
              </tr>
            </thead>
            <tbody>
              {hyp.lignes?.map((l, i) => (
                <tr key={i} className="border-t border-paper-200">
                  <td className="px-3 py-1 text-ink-500 text-[10px] uppercase tracking-widest">{l.rubrique}</td>
                  <td className="px-3 py-1 text-ink-700">
                    {l.poste}
                    {l.ratio_commentaire && (
                      <span className="text-[10px] text-ink-500 ml-2 italic">({l.ratio_commentaire})</span>
                    )}
                  </td>
                  <td className="px-3 py-1"><NumInput value={l.brs} onChange={(n) => updateLigne(i, "brs", n)} compact /></td>
                  <td className="px-3 py-1"><NumInput value={l.pli} onChange={(n) => updateLigne(i, "pli", n)} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* M3 - Exploitation */}
      {hyp.exploitation && (
        <>
          <Section title="M3 — Exploitation locative (hypothèses globales)">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <LabelInput
                label="Loyer annuel initial (€)"
                value={hyp.exploitation.loyer_annuel_initial ?? 0}
                onChange={(n) => updateExploit("loyer_annuel_initial", n)}
              />
              <LabelInput
                label="Taux impayés (%)"
                value={hyp.exploitation.taux_impayes_pct ?? 0}
                onChange={(n) => updateExploit("taux_impayes_pct", n)}
                step={0.1}
              />
              <LabelInput
                label="Évol. loyers /an (%)"
                value={hyp.exploitation.taux_evolution_loyers_pct ?? 0}
                onChange={(n) => updateExploit("taux_evolution_loyers_pct", n)}
                step={0.1}
              />
              <LabelInput
                label="Frais gestion / lgt / an (€)"
                value={hyp.exploitation.frais_gestion_par_logement ?? 0}
                onChange={(n) => updateExploit("frais_gestion_par_logement", n)}
              />
              <LabelInput
                label="TFPB / lgt / an (€)"
                value={hyp.exploitation.tfpb_par_logement ?? 0}
                onChange={(n) => updateExploit("tfpb_par_logement", n)}
              />
              <LabelInput
                label="Durée exonération TFPB (ans)"
                value={hyp.exploitation.duree_exoneration_tfpb_ans ?? 0}
                onChange={(n) => updateExploit("duree_exoneration_tfpb_ans", n)}
              />
            </div>
          </Section>

          <Section title="M3 — Plan de financement (prêts)">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-ink-500 bg-paper-50">
                  <th className="text-left px-4 py-2 font-medium">Prêt</th>
                  <th className="text-right px-4 py-2 font-medium">Montant (€)</th>
                  <th className="text-right px-4 py-2 font-medium">Taux (%)</th>
                  <th className="text-right px-4 py-2 font-medium">Durée (ans)</th>
                </tr>
              </thead>
              <tbody>
                {hyp.exploitation.prets?.map((p, i) => (
                  <tr key={i} className="border-t border-paper-200">
                    <td className="px-4 py-1.5 text-ink-900">{p.nom}</td>
                    <td className="px-4 py-1.5"><NumInput value={p.montant} onChange={(n) => updatePret(i, "montant", n)} /></td>
                    <td className="px-4 py-1.5"><NumInput value={p.taux_pct} onChange={(n) => updatePret(i, "taux_pct", n)} step={0.01} /></td>
                    <td className="px-4 py-1.5"><NumInput value={p.duree_ans} onChange={(n) => updatePret(i, "duree_ans", n)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-sm border border-paper-200 bg-white overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-paper-200 flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-widest text-ink-500 font-medium">{title}</div>
        {subtitle && <div className="text-[10px] text-ink-500 italic">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

function NumInput({
  value,
  onChange,
  step = 1,
  compact = false,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  compact?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className={`w-full text-right tabular-nums border border-paper-200 rounded-sm focus:border-brand-500 focus:outline-none ${compact ? "px-1 py-0.5 text-xs" : "px-2 py-1"}`}
    />
  );
}

function LabelInput({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-ink-500">{label}</span>
      <NumInput value={value} onChange={onChange} step={step} />
    </label>
  );
}
