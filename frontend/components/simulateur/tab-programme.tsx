"use client";
import { PRODUITS, type Produit } from "@/lib/simulateur";
import { NumInput, Section, eur, num, th, td, tdNum } from "./ui";
import type { TabProps } from "./tab-props";

const LIBELLES: Record<Produit, string> = {
  PLAI: "PLAI — prêt locatif aidé d'intégration",
  PLUS: "PLUS — prêt locatif à usage social",
  PLS: "PLS — prêt locatif social",
  PLI: "PLI — logement intermédiaire",
  BRS: "BRS — bail réel solidaire (redevance foncière)",
};

export function TabProgramme({ data, result, update, canEdit }: TabProps) {
  const pp = result.programme.par_produit;
  const tot = result.programme.total;
  const setRow = (p: Produit, i: number, k: "nb" | "shab" | "annexe", v: number) =>
    update((d) => {
      const row = d.programme[p][i];
      row[k] = k === "nb" ? Math.max(0, Math.round(v)) : Math.max(0, v);
    });

  return (
    <div>
      <Section title="Récapitulatif du programme">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper-50">
              <tr>
                <th className={`${th} text-left`}>Produit</th>
                <th className={`${th} text-right`}>Logements</th>
                <th className={`${th} text-right`}>SHAB (m²)</th>
                <th className={`${th} text-right`}>SU (m²)</th>
                <th className={`${th} text-right`}>€/m² SU/mois</th>
                <th className={`${th} text-right`}>Loyer / redevance annuel</th>
              </tr>
            </thead>
            <tbody>
              {PRODUITS.map((p) => (
                <tr key={p} className="border-t border-paper-200">
                  <td className={`${td} font-medium text-ink-900`}>{p}</td>
                  <td className={tdNum}>{num(pp[p].nb)}</td>
                  <td className={tdNum}>{num(pp[p].shab, 2)}</td>
                  <td className={tdNum}>{num(pp[p].su, 2)}</td>
                  <td className={tdNum}>{num(pp[p].loyer_m2, 2)}</td>
                  <td className={tdNum}>{eur(pp[p].loyer_annuel)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink-300 bg-paper-50 font-semibold">
                <td className={td}>Total</td>
                <td className={tdNum}>{num(tot.nb)}</td>
                <td className={tdNum}>{num(tot.shab, 2)}</td>
                <td className={tdNum}>{num(tot.su, 2)}</td>
                <td className={tdNum} />
                <td className={tdNum}>{eur(tot.loyer_annuel)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-5 py-2 text-[11px] text-ink-500 border-t border-paper-200">
          Loyers en valeur {data.hypotheses.annee_bareme} (millésime des barèmes), indexés ensuite dans le bilan d'exploitation.
          Une surface annexe vide compte pour 0 m².
        </p>
      </Section>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-x-5">
        {PRODUITS.map((p) => (
          <Section
            key={p}
            title={LIBELLES[p]}
            subtitle={`${num(pp[p].nb)} logements · ${num(pp[p].su, 1)} m² SU · ${eur(pp[p].loyer_annuel)} / an`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper-50">
                  <tr>
                    <th className={`${th} text-left`}>Typo.</th>
                    <th className={`${th} text-right`}>Nb logts</th>
                    <th className={`${th} text-right`}>SHAB moy. (m²)</th>
                    <th className={`${th} text-right`}>Annexe brute (m²)</th>
                    <th className={`${th} text-right`}>SU moy.</th>
                    <th className={`${th} text-right`}>Mensuel / logt</th>
                    <th className={`${th} text-right`}>Annuel total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.programme[p].map((row, i) => {
                    const calc = pp[p].lignes[i];
                    return (
                      <tr key={i} className="border-t border-paper-200">
                        <td className={`${td} text-ink-900`}>{row.typologie}</td>
                        <td className="px-2 py-1 w-20">
                          <NumInput value={row.nb} onChange={(v) => setRow(p, i, "nb", v ?? 0)} decimals={0} disabled={!canEdit} ariaLabel={`${p} ${row.typologie} nombre`} />
                        </td>
                        <td className="px-2 py-1 w-24">
                          <NumInput value={row.shab} onChange={(v) => setRow(p, i, "shab", v ?? 0)} disabled={!canEdit} ariaLabel={`${p} ${row.typologie} SHAB`} />
                        </td>
                        <td className="px-2 py-1 w-24">
                          <NumInput value={row.annexe} onChange={(v) => setRow(p, i, "annexe", v ?? 0)} disabled={!canEdit} ariaLabel={`${p} ${row.typologie} annexe`} />
                        </td>
                        <td className={`${tdNum} text-ink-700`}>{calc ? num(calc.su_moy, 2) : "—"}</td>
                        <td className={`${tdNum} text-ink-700`}>{calc && row.nb ? eur(calc.loyer_mensuel_logt, 2) : "—"}</td>
                        <td className={`${tdNum} text-ink-900`}>{calc && row.nb ? eur(calc.loyer_annuel_total) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}
