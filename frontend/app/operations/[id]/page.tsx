import Link from "next/link";
import { FileDown, ArrowRight, AlertTriangle, AlertOctagon, Info } from "lucide-react";
import { api } from "@/lib/api";
import { KpiCard } from "@/components/kpi-card";
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
  const planning = await api.getPlanning(opId).catch(() => null);
  const aujourd = new Date().toISOString().slice(0, 10);
  const prochainsJalons = (planning?.taches || [])
    .filter((t) => t.type === "jalon" && t.statut !== "termine" && t.debut >= aujourd)
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .slice(0, 3);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500">Tableau de bord · {sim.operation.code}</div>
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
            Ouvrir le montage financier <ArrowRight size={13} />
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
          <div className="text-[11px] uppercase tracking-widest text-ink-500 mb-3">Montage financier — accès direct</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ONGLETS.map((o) => (
              <Link
                key={o.key}
                href={`/operations/${opId}/simulateur?onglet=${o.key}`}
                className="rounded-sm border border-paper-200 px-3 py-2 hover:border-brand-500 hover:bg-brand-50 transition"
              >
                <div className="text-[11px] text-ink-500">Onglet {o.num}</div>
                <div className="text-sm text-ink-900">{o.label}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 rounded-sm border border-paper-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-paper-200 text-[11px] uppercase tracking-widest text-ink-500">
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

      {planning && (
        <div className="rounded-sm border border-paper-200 bg-white p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="text-[11px] uppercase tracking-widest text-ink-500">Gestion de projet</div>
            <div className="flex items-center gap-3 text-[11px]">
              <Link href={`/operations/${opId}/projet?vue=gantt`} className="text-brand-500 hover:underline">Diagramme de Gantt →</Link>
              <Link href={`/operations/${opId}/projet?vue=phases`} className="text-brand-500 hover:underline">Suivi des phases →</Link>
            </div>
          </div>
          {planning.phases.length === 0 ? (
            <p className="text-sm text-ink-500">
              Aucune phase définie.{" "}
              <Link href={`/operations/${opId}/projet?vue=phases`} className="text-brand-500 hover:underline">Initialiser le suivi de projet</Link>
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-2 flex-1 rounded-full bg-paper-100 overflow-hidden">
                  <div className="h-full bg-brand-500" style={{ width: `${planning.projet.avancement}%` }} />
                </div>
                <span className="text-sm text-ink-900 font-medium">{planning.projet.avancement} %</span>
                {planning.projet.nb_en_retard > 0 && <span className="text-xs text-danger-500 font-medium">{planning.projet.nb_en_retard} en retard</span>}
              </div>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {planning.phases.map((ph) => (
                  <div key={ph.id} className="text-center">
                    <div className={`mx-auto h-2 rounded-full ${ph.statut === "termine" ? "bg-ok-500" : ph.statut === "en_cours" ? "bg-warn-500" : ph.statut === "bloque" ? "bg-danger-500" : "bg-paper-200"}`} />
                    <div className="text-[11px] text-ink-700 mt-1 leading-tight">{ph.nom}</div>
                  </div>
                ))}
              </div>
              {prochainsJalons.length > 0 && (
                <div className="mt-4 text-xs text-ink-700 flex flex-wrap gap-x-5 gap-y-1">
                  <span className="text-ink-500">Prochains jalons :</span>
                  {prochainsJalons.map((j) => (
                    <span key={j.id}><span className="text-fuchsia-600">◆</span> {j.titre} — {j.debut.split("-").reverse().join("/")}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mb-6">
        <AttachmentsPanel parentType="operation" parentId={opId} title="Documents de l'opération" />
      </div>

      {sim.result.programme.total.nb_locatif > 0 && (
        <div className="rounded-sm border border-paper-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-widest text-ink-500">
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
