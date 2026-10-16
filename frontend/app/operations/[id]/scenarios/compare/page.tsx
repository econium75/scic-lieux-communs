import { api } from "@/lib/api";
import { formatEuro, formatPct, formatNumber } from "@/lib/format";
import { AlerteItem, AlerteCount } from "@/components/alerte-item";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { a?: string; b?: string };
}) {
  const opId = Number(params.id);
  const a = Number(searchParams.a);
  const b = Number(searchParams.b);
  if (!a || !b || a === b) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
        <p className="text-sm text-ink-500">URL invalide — attendue : ?a=ID1&amp;b=ID2</p>
        <Link href={`/operations/${opId}/scenarios`} className="text-brand-500 underline text-sm">
          ← Retour
        </Link>
      </div>
    );
  }

  const data = await api.compareScenarios([a, b]);
  const [sa, sb] = data.scenarios;

  if (!sa || !sb) {
    return <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">Scénarios introuvables.</div>;
  }

  const delta = (va: number, vb: number) => vb - va;
  const deltaColor = (va: number, vb: number, higherIsBetter = true) => {
    const d = vb - va;
    if (Math.abs(d) < 0.01) return "text-ink-500";
    return (higherIsBetter ? d > 0 : d < 0) ? "text-ok-500" : "text-danger-500";
  };

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href={`/operations/${opId}/scenarios`}
            className="text-xs text-ink-500 hover:text-brand-500 flex items-center gap-1 mb-2"
          >
            <ArrowLeft size={12} /> Retour aux scénarios
          </Link>
          <div className="text-[11px] uppercase tracking-widest text-ink-500">
            M5 — Comparaison côte-à-côte
          </div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">
            {sa.nom} <span className="text-ink-500 font-sans text-lg">vs</span> {sb.nom}
          </h1>
        </div>
      </div>

      {/* KPIs comparatifs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCompare
          label="Prix de revient HT"
          va={sa.bilan.prix_revient_ht_total}
          vb={sb.bilan.prix_revient_ht_total}
          format={(v) => formatEuro(v, { compact: true })}
          higherIsBetter={false}
        />
        <KpiCompare
          label="Marge nette"
          va={sa.bilan.marge_nette_totale}
          vb={sb.bilan.marge_nette_totale}
          format={(v) => formatEuro(v, { compact: true })}
          higherIsBetter={true}
        />
        <KpiCompare
          label="Marge nette %"
          va={sa.bilan.marge_nette_pct}
          vb={sb.bilan.marge_nette_pct}
          format={(v) => formatPct(v)}
          higherIsBetter={true}
        />
        {sa.exploitation && sb.exploitation && (
          <>
            <KpiCompare
              label="Loyer d'équilibre €/m²/mois"
              va={sa.exploitation.loyer_equilibre_m2_mois}
              vb={sb.exploitation.loyer_equilibre_m2_mois}
              format={(v) => `${v.toString().replace(".", ",")} €`}
              higherIsBetter={false}
            />
            <KpiCompare
              label="CAF année 1"
              va={sa.exploitation.caf_annee_1}
              vb={sb.exploitation.caf_annee_1}
              format={(v) => formatEuro(v, { compact: true })}
              higherIsBetter={true}
            />
            <KpiCompare
              label="Cumul trésorerie fin"
              va={sa.exploitation.cumul_tresorerie_fin}
              vb={sb.exploitation.cumul_tresorerie_fin}
              format={(v) => formatEuro(v, { compact: true })}
              higherIsBetter={true}
            />
          </>
        )}
      </div>

      {/* Ventilation par rubrique */}
      <div className="rounded-sm border border-paper-200 bg-white overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-paper-200 text-[11px] uppercase tracking-widest text-ink-500">
          Ventilation par rubrique (prix de revient)
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-5 py-2 font-medium">Rubrique</th>
              <th className="text-right px-5 py-2 font-medium">{sa.nom}</th>
              <th className="text-right px-5 py-2 font-medium">{sb.nom}</th>
              <th className="text-right px-5 py-2 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {sa.bilan.totaux_rubriques.map((ta, i) => {
              const tb = sb.bilan.totaux_rubriques[i];
              if (!tb) return null;
              const d = delta(ta.total, tb.total);
              return (
                <tr key={ta.rubrique} className="border-t border-paper-200 hover:bg-paper-50/50">
                  <td className="px-5 py-2 text-ink-700">{ta.rubrique}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEuro(ta.total)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatEuro(tb.total)}</td>
                  <td className={`px-5 py-2 text-right tabular-nums font-medium ${deltaColor(ta.total, tb.total, false)}`}>
                    {d > 0 ? "+" : ""}{formatEuro(d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Alertes */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-paper-200 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-widest text-ink-500">Alertes — {sa.nom}</div>
            <AlerteCount alertes={sa.bilan.alertes} />
          </div>
          <div>
            {sa.bilan.alertes.map((a, i) => (
              <AlerteItem key={i} alerte={a} />
            ))}
          </div>
        </div>
        <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-paper-200 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-widest text-ink-500">Alertes — {sb.nom}</div>
            <AlerteCount alertes={sb.bilan.alertes} />
          </div>
          <div>
            {sb.bilan.alertes.map((a, i) => (
              <AlerteItem key={i} alerte={a} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCompare({
  label,
  va,
  vb,
  format,
  higherIsBetter,
}: {
  label: string;
  va: number;
  vb: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}) {
  const d = vb - va;
  const pct = va !== 0 ? Math.abs((d / va) * 100) : 0;
  const positive = higherIsBetter ? d > 0 : d < 0;
  const toneColor = Math.abs(d) < 0.01 ? "text-ink-500" : positive ? "text-ok-500" : "text-danger-500";

  return (
    <div className="rounded-sm border border-paper-200 bg-white p-4">
      <div className="text-[11px] uppercase tracking-widest text-ink-500">{label}</div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
        <div>
          <div className="text-[11px] text-ink-500">A</div>
          <div className="font-serif text-lg text-ink-900">{format(va)}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-500">B</div>
          <div className="font-serif text-lg text-ink-900">{format(vb)}</div>
        </div>
      </div>
      <div className={`text-xs mt-2 font-medium ${toneColor}`}>
        Δ : {d > 0 ? "+" : ""}{format(d)} ({pct.toFixed(1).replace(".", ",")} %)
      </div>
    </div>
  );
}
