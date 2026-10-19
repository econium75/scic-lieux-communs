"use client";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { ONGLETS, selonPerimetre } from "@/lib/simulateur";
import { cn } from "@/lib/format";
import { Kpi, PerimetreSelect, ReadOnlyBanner, Section, eur, num, pct, th, td, tdNum } from "./ui";
import { AutofinancementChart } from "./autofinancement-chart";
import type { TabProps } from "./tab-props";

export function TabSynthese({ result, goTo, brs, setBrs }: TabProps) {
  const { synthese: s, exploitation } = selonPerimetre(result, brs);
  const avecBrs = s.perimetre === "avec_brs" && s.a_des_brs;
  const alertes = result.alertes;
  const repartition = s.repartition.filter((r) => r.nb > 0 || r.prix_revient_ttc !== 0);
  const total = repartition.reduce(
    (a, r) => ({ nb: a.nb + r.nb, shab: a.shab + r.shab, pr: a.pr + r.prix_revient_ttc, loyer: a.loyer + r.loyer_annuel }),
    { nb: 0, shab: 0, pr: 0, loyer: 0 }
  );
  const structure = s.structure.filter((x) => x.montant !== 0);

  return (
    <div>
      <ReadOnlyBanner>Synthèse calculée, non modifiable — exportable en Excel (bouton « Exporter l'onglet »).</ReadOnlyBanner>

      <PerimetreSelect value={brs} onChange={setBrs} aDesBrs={result.synthese.a_des_brs} />

      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-widest text-ink-500">
          Synthèse — simulation financière de l'opération{s.a_des_brs ? (avecBrs ? " · avec BRS" : " · sans BRS") : ""}
        </div>
        <h2 className="font-serif text-xl text-ink-900 mt-0.5">
          {s.titre} <span className="text-ink-500 text-base">(zones {s.zones.zone_123} / {s.zones.zone_abc} · livraison {s.annee_livraison})</span>
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-3">
        <Kpi label="Logements" value={num(s.nb_logements)} sub={`${num(s.shab, 0)} m² SHAB`} />
        <Kpi label="Prix de revient TTC" value={eur(s.prix_revient_ttc)} sub={`${eur(s.prix_revient_logt)} / logt`} />
        <Kpi label="Prix de revient / m² SHAB" value={eur(s.prix_revient_m2)} />
        <Kpi label="Fonds propres" value={eur(s.fonds_propres_total)} sub={`subventions : ${eur(s.subventions_total)}`} />
        <Kpi label="Total emprunts" value={eur(s.emprunts_total)} sub={`annuités année 1 : ${eur(s.annuites_a1)}`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        <Kpi label="Autofinancement net année 1" value={eur(s.autofinancement_net_a1)} tone={s.autofinancement_net_a1 < 0 ? "danger" : "ok"} sub={avecBrs ? "locatif + compte OFS" : "locatif"} />
        <Kpi label="DSCR année 1" value={s.dscr_a1 === null ? "—" : num(s.dscr_a1, 2)} tone={s.dscr_a1 !== null && s.dscr_a1 < 1 ? "warn" : "default"} />
        <Kpi label="Retour à l'équilibre" value={s.annee_equilibre ? `année ${s.annee_equilibre}` : "non atteint"} tone={s.annee_equilibre ? "default" : "danger"} />
        {s.brs.produit_cession_ht > 0 && <Kpi label="Cession BRS (HT)" value={eur(s.brs.produit_cession_ht)} sub={`marge : ${eur(s.brs.marge_cession)}`} />}
        {s.brs.solde_ofs_a1 !== null && <Kpi label="Solde OFS BRS année 1" value={eur(s.brs.solde_ofs_a1)} tone={s.brs.solde_ofs_a1 < 0 ? "danger" : "ok"} />}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-x-5">
        <Section title="Répartition par financement" className="xl:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper-50">
                <tr>
                  <th className={`${th} text-left`}>Financement</th>
                  <th className={`${th} text-right`}>Logts</th>
                  <th className={`${th} text-right`}>SHAB (m²)</th>
                  <th className={`${th} text-right`}>Prix de revient TTC</th>
                  <th className={`${th} text-right`}>€/m² SU/mois</th>
                  <th className={`${th} text-right`}>Loyer annuel</th>
                </tr>
              </thead>
              <tbody>
                {repartition.map((r) => (
                  <tr key={r.produit} className="border-t border-paper-200">
                    <td className={`${td} font-medium text-ink-900`}>{r.produit}</td>
                    <td className={tdNum}>{num(r.nb)}</td>
                    <td className={tdNum}>{num(r.shab, 0)}</td>
                    <td className={tdNum}>{eur(r.prix_revient_ttc)}</td>
                    <td className={tdNum}>{num(r.loyer_m2, 2)}</td>
                    <td className={tdNum}>{eur(r.loyer_annuel)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-ink-300 bg-paper-50 font-semibold">
                  <td className={td}>Total</td>
                  <td className={tdNum}>{num(total.nb)}</td>
                  <td className={tdNum}>{num(total.shab, 0)}</td>
                  <td className={tdNum}>{eur(total.pr)}</td>
                  <td />
                  <td className={tdNum}>{eur(total.loyer)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Structure du plan de financement" className="xl:col-span-2">
          <div className="p-4 space-y-3">
            {structure.map((x) => (
              <div key={x.poste}>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-700">{x.poste}</span>
                  <span className="tabular-nums text-ink-900">{eur(x.montant)} <span className="text-ink-500 text-xs">· {pct(x.part)}</span></span>
                </div>
                <div className="h-2 bg-paper-100 rounded-sm mt-1 overflow-hidden">
                  <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(0, x.part * 100))}%` }} />
                </div>
              </div>
            ))}
            {structure.length === 0 && <div className="text-xs text-ink-500 italic">Aucun financement saisi.</div>}
          </div>
        </Section>
      </div>

      <Section title={`Points d'attention (${alertes.length})`}>
        {alertes.length === 0 ? (
          <div className="px-5 py-4 text-sm text-ok-500">Aucune alerte : plan de financement équilibré et repères réglementaires respectés.</div>
        ) : (
          <ul>
            {alertes.map((a, i) => {
              const Icon = a.niveau === "danger" ? AlertOctagon : a.niveau === "warn" ? AlertTriangle : Info;
              const ong = ONGLETS.find((o) => o.key === a.onglet);
              return (
                <li key={i} className="flex items-start gap-3 px-4 sm:px-5 py-2.5 border-t border-paper-200 first:border-t-0">
                  <Icon size={15} className={cn("mt-0.5 shrink-0", a.niveau === "danger" ? "text-danger-500" : a.niveau === "warn" ? "text-warn-500" : "text-brand-500")} />
                  <span className="text-sm text-ink-700 flex-1">{a.message}</span>
                  {ong && (
                    <button onClick={() => goTo(ong.key)} className="text-[11px] text-brand-500 hover:underline whitespace-nowrap">
                      {ong.num}. {ong.label} →
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {(result.programme.total.nb_locatif > 0 || avecBrs) && (
        <Section title={avecBrs ? "Autofinancement net — locatif et compte OFS" : "Autofinancement net du locatif"}>
          <div className="p-3 sm:p-4">
            <AutofinancementChart lignes={exploitation.lignes} height={240} />
          </div>
        </Section>
      )}
    </div>
  );
}
