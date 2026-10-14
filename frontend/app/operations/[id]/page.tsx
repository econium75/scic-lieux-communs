import Link from "next/link";
import { FileDown, ArrowRight, AlertTriangle, AlertOctagon, Info } from "lucide-react";
import { api } from "@/lib/api";
import { KpiCard } from "@/components/kpi-card";
import { PhasesTimeline } from "@/components/phases-timeline";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { AutofinancementChart } from "@/components/simulateur/autofinancement-chart";
import { formatEuro, formatNumber } from "@/lib/format";
import { ONGLETS, exportUrl } from "@/lib/simulateur";

export default async function TableauDeBordPage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  const sim = await api.getSimulation(opId);
  const s = sim.result.synthese;
  const alertes = sim.result.alertes;
  const produits = s.repartition.filter((r) => r.nb > 0);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">Tableau de bord · {sim.operation.code}</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">{sim.data.hypotheses.nom_operation || sim.operation.nom}</h1>
          <p className="text-sm text-ink-500 mt-1">
            {sim.data.hypotheses.commune || sim.operation.commune} · zones {s.zones.zone_123} / {s.zones.zone_abc} · livraison {s.annee_livraison}
            {produits.length > 0 && <> · {produits.map((r) => `${r.nb} ${r.produit}`).join(" + ")}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/operations/${opId}/simulateur?onglet=hypotheses`}
            className="text-xs px-3 py-1.5 bg-brand-500 text-white rounded-sm hover:bg-brand-700 inline-flex items-center gap-1.5"
          >
            Ouvrir le simulateur <ArrowRight size={13} />
          </Link>
          <a
            href={exportUrl(opId, "complet")}
            className="text-xs px-3 py-1.5 border border-paper-200 bg-white text-ink-700 rounded-sm hover:bg-paper-50 inline-flex items-center gap-1.5"
          >
            <FileDown size={13} /> Classeur Excel complet
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        <KpiCard label="Prix de revient TTC" value={formatEuro(s.prix_revient_ttc, { compact: true })} sub={`${formatEuro(s.prix_revient_m2)}/m² SHAB · ${formatNumber(s.nb_logements)} logts`} />
        <KpiCard label="Total emprunts" value={formatEuro(s.emprunts_total, { compact: true })} sub={`Subventions ${formatEuro(s.subventions_total, { compact: true })} · FP ${formatEuro(s.fonds_propres_total, { compact: true })}`} />
        <KpiCard
          label="Autofinancement net an 1"
          value={formatEuro(s.autofinancement_net_a1, { compact: true })}
          sub={s.dscr_a1 !== null ? `DSCR ${s.dscr_a1.toFixed(2).replace(".", ",")}` : "aucun locatif"}
          tone={s.autofinancement_net_a1 < 0 ? "danger" : "ok"}
        />
        <KpiCard
          label="Retour à l'équilibre"
          value={s.annee_equilibre ? `année ${s.annee_equilibre}` : "—"}
          sub="cumul d'autofinancement > 0"
          tone={s.annee_equilibre ? "default" : "warn"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <div className="lg:col-span-3 rounded-sm border border-paper-200 bg-white p-5">
          <div className="text-[10px] uppercase tracking-widest text-ink-500 mb-3">Simulateur — accès direct</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ONGLETS.map((o) => (
              <Link
                key={o.key}
                href={`/operations/${opId}/simulateur?onglet=${o.key}`}
                className="rounded-sm border border-paper-200 px-3 py-2 hover:border-brand-500 hover:bg-brand-50 transition"
              >
                <div className="text-[10px] text-ink-500">Onglet {o.num}</div>
                <div className="text-sm text-ink-900">{o.label}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 rounded-sm border border-paper-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-paper-200 text-[10px] uppercase tracking-widest text-ink-500">
            Points d'attention ({alertes.length})
          </div>
          {alertes.length === 0 && <div className="px-4 py-3 text-sm text-ok-500">Aucune alerte.</div>}
          <ul className="max-h-64 overflow-y-auto">
            {alertes.map((a, i) => {
              const Icon = a.niveau === "danger" ? AlertOctagon : a.niveau === "warn" ? AlertTriangle : Info;
              const color = a.niveau === "danger" ? "text-danger-500" : a.niveau === "warn" ? "text-warn-500" : "text-brand-500";
              return (
                <li key={i} className="px-4 py-2 border-b border-paper-200 last:border-b-0 flex gap-2 text-sm text-ink-700">
                  <Icon size={14} className={`${color} mt-0.5 shrink-0`} />
                  <Link href={`/operations/${opId}/simulateur?onglet=${a.onglet}`} className="hover:underline">{a.message}</Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="rounded-sm border border-paper-200 bg-white p-5 mb-6">
        <PhasesTimeline operationId={opId} />
      </div>

      <div className="mb-6">
        <AttachmentsPanel parentType="operation" parentId={opId} title="Documents de l'opération" />
      </div>

      {sim.result.programme.total.nb_locatif > 0 && (
        <div className="rounded-sm border border-paper-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] uppercase tracking-widest text-ink-500">
              Exploitation locative — projection {sim.result.exploitation.kpis.nb_annees} ans
            </div>
            <Link href={`/operations/${opId}/simulateur?onglet=exploitation`} className="text-[11px] text-brand-500 hover:underline">
              Bilan d'exploitation détaillé →
            </Link>
          </div>
          <AutofinancementChart lignes={sim.result.exploitation.lignes} />
        </div>
      )}
    </div>
  );
}
