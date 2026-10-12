import { api } from "@/lib/api";
import { KpiCard } from "@/components/kpi-card";
import { AlerteItem, AlerteCount } from "@/components/alerte-item";
import { PhasesTimeline } from "@/components/phases-timeline";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { formatEuro, formatNumber } from "@/lib/format";
import { CashflowChart } from "./bilan/cashflow-chart";
import Link from "next/link";
import { RefreshCw, FileDown } from "lucide-react";

export default async function SynthesePage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  const operation = await api.getOperation(opId);
  const scenarios = await api.listScenarios(opId);
  const scenario = scenarios.find((s) => s.is_reference) || scenarios[0];
  const bilan = await api.calculerBilan(scenario.id);
  const exploit = await api.calculerExploitation(scenario.id).catch(() => null);

  const brs = bilan.sous_bilans.find((s) => s.volet === "BRS");
  const pli = bilan.sous_bilans.find((s) => s.volet === "PLI");

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      {/* Barre d'action haute */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <Link href={`/operations/${opId}/bilan`} className="px-3 py-1.5 rounded-sm hover:bg-paper-100">
            Bilan d'opération
          </Link>
          <span className="text-ink-300">·</span>
          <Link href={`/operations/${opId}/commercialisation`} className="px-3 py-1.5 rounded-sm hover:bg-paper-100">
            Commercialisation BRS
          </Link>
          <span className="text-ink-300">·</span>
          <Link href={`/operations/${opId}/exploitation`} className="px-3 py-1.5 rounded-sm hover:bg-paper-100">
            Exploitation PLS
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/exports/bilan/${scenario.id}.xlsx`}
            className="text-xs px-3 py-1.5 border border-warn-500 text-warn-500 rounded-sm hover:bg-warn-50 flex items-center gap-1.5"
          >
            <FileDown size={13} /> Export bilan .xlsx
          </a>
        </div>
      </div>

      {/* Header opération */}
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-ink-500">Synthèse de l'opération</div>
        <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">{operation.nom}</h1>
        <p className="text-sm text-ink-500 mt-1">
          {operation.commune} · Zone BRS {operation.zone_brs} · Livraison {operation.livraison_cible}
        </p>
      </div>

      {/* Description + alertes */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <div className="lg:col-span-3 rounded-sm border border-paper-200 bg-white p-5">
          <div className="text-[10px] uppercase tracking-widest text-ink-500">Description</div>
          <p className="text-sm text-ink-700 mt-2 leading-relaxed">
            Opération mixte de {bilan.nb_logements_total} logements : {bilan.nb_logements_brs} BRS accession sociale +{" "}
            {bilan.nb_logements_pli} PLI/béguinage locatif. SHAB {formatNumber(bilan.shab_total_m2)} m² ·
            SDP {formatNumber(bilan.sdp_total_m2)} m².
          </p>

          {/* Mini-recap par volet */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            {brs && <SousBilanCard sb={brs} />}
            {pli && <SousBilanCard sb={pli} />}
          </div>
        </div>

        {/* Alertes */}
        <div className="lg:col-span-2 rounded-sm border border-paper-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-paper-200 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-ink-500">Alertes</div>
            <AlerteCount alertes={bilan.alertes} />
          </div>
          <div>
            {bilan.alertes.map((a, i) => (
              <AlerteItem key={i} alerte={a} />
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        <KpiCard
          label="Prix de revient HT"
          value={formatEuro(bilan.prix_revient_ht_total, { compact: true })}
          sub={`${formatEuro(bilan.prix_revient_m2_shab)}/m² SHAB`}
        />
        <KpiCard
          label="Prix de vente HT"
          value={formatEuro(bilan.prix_vente_ht_total, { compact: true })}
          sub={brs && pli ? `${formatEuro(brs.prix_vente_ht, { compact: true })} BRS + ${formatEuro(pli.prix_vente_ht, { compact: true })} PLI` : ""}
        />
        <KpiCard
          label="Marge brute (pré-sub)"
          value={formatEuro(bilan.marge_brute_totale, { compact: true })}
          sub={`Subventions : ${formatEuro(bilan.subventions_totales, { compact: true })}`}
          tone={bilan.marge_brute_totale < 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Marge nette"
          value={formatEuro(bilan.marge_nette_totale, { compact: true })}
          sub={`${bilan.marge_nette_pct.toString().replace(".", ",")} % du PR`}
          tone={bilan.marge_nette_totale < 0 ? "danger" : bilan.marge_nette_pct < 3 ? "warn" : "ok"}
        />
      </div>

      {/* Phases projet */}
      <div className="rounded-sm border border-paper-200 bg-white p-5 mb-6">
        <PhasesTimeline operationId={opId} />
      </div>

      {/* Pièces jointes opération */}
      <div className="mb-6">
        <AttachmentsPanel parentType="operation" parentId={opId} title="Documents de l'opération" />
      </div>

      {/* Chart exploitation PLS */}
      <div className="rounded-sm border border-paper-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] uppercase tracking-widest text-ink-500">
            Exploitation locative — projection {exploit?.duree_projection_ans ?? 40} ans (M3)
          </div>
          <Link href={`/operations/${opId}/exploitation`} className="text-[11px] text-brand-500 hover:underline">
            Détail compte d'exploitation →
          </Link>
        </div>
        <CashflowChart annees={exploit?.annees} />
      </div>
    </div>
  );
}

function SousBilanCard({ sb }: { sb: NonNullable<Awaited<ReturnType<typeof api.calculerBilan>>["sous_bilans"][number]> }) {
  const tone = sb.marge_brute < 0 ? "border-danger-500/40 bg-danger-50/40" : "border-paper-200";
  return (
    <div className={`rounded-sm border ${tone} p-3 text-xs`}>
      <div className="text-[10px] uppercase tracking-widest text-ink-500">
        {sb.volet} · {sb.nb_logements} lgts
      </div>
      <div className="font-serif text-base text-ink-900 mt-1">{formatEuro(sb.prix_revient_ht, { compact: true })} PR</div>
      <dl className="mt-2 space-y-1 text-ink-700">
        <div className="flex justify-between">
          <dt>Marge brute</dt>
          <dd className={sb.marge_brute < 0 ? "text-danger-500 font-medium" : "tabular-nums"}>
            {formatEuro(sb.marge_brute, { compact: true })}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Subventions</dt>
          <dd className="tabular-nums">+{formatEuro(sb.subventions, { compact: true })}</dd>
        </div>
        <div className="flex justify-between border-t border-paper-200 pt-1 mt-1 font-medium">
          <dt>Marge nette</dt>
          <dd className="tabular-nums">
            {formatEuro(sb.marge_nette, { compact: true })} ({sb.marge_nette_pct.toString().replace(".", ",")} %)
          </dd>
        </div>
      </dl>
    </div>
  );
}
