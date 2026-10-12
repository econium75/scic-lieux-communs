import { api } from "@/lib/api";
import { formatEuro, formatNumber } from "@/lib/format";
import { FileDown } from "lucide-react";
import type { Rubrique } from "@/lib/types";

const RUBRIQUE_ORDER: Rubrique[] = [
  "FONCIER",
  "TRAVAUX BÂTIMENT",
  "HONORAIRES BÂTIMENT",
  "COMMERCIALISATION",
  "GESTION ET MOD",
  "FRAIS FINANCIERS",
];

export default async function BilanPage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  const scenarios = await api.listScenarios(opId);
  const scenario = scenarios.find((s) => s.is_reference) || scenarios[0];
  const bilan = await api.calculerBilan(scenario.id);

  // Grouper lignes par rubrique
  const byRubrique: Record<string, typeof bilan.lignes> = {};
  for (const l of bilan.lignes) {
    (byRubrique[l.rubrique] ||= []).push(l);
  }
  const totauxByRubrique: Record<string, typeof bilan.totaux_rubriques[number]> = {};
  for (const t of bilan.totaux_rubriques) totauxByRubrique[t.rubrique] = t;

  const brs = bilan.sous_bilans.find((s) => s.volet === "BRS");
  const pli = bilan.sous_bilans.find((s) => s.volet === "PLI");

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">M2 — Bilan d'opération promoteur</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">{bilan.nom}</h1>
          <p className="text-sm text-ink-500 mt-1">
            {bilan.commune} · Livraison {bilan.livraison_cible} · {bilan.nb_logements_total} lgts ·
            SHAB {formatNumber(bilan.shab_total_m2)} m² · SDP {formatNumber(bilan.sdp_total_m2)} m²
          </p>
        </div>
        <a
          href={`/api/exports/bilan/${scenario.id}.xlsx`}
          className="text-xs px-4 py-2 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-2"
        >
          <FileDown size={13} /> Export Excel
        </a>
      </div>

      {/* Table ventilation 3 colonnes */}
      <div className="rounded-sm border border-paper-200 bg-white overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-5 py-2 font-medium">Poste</th>
              <th className="text-right px-5 py-2 font-medium w-36">BRS ({brs?.nb_logements})</th>
              <th className="text-right px-5 py-2 font-medium w-40">PLI/Béguinage ({pli?.nb_logements})</th>
              <th className="text-right px-5 py-2 font-medium w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {RUBRIQUE_ORDER.map((rubrique) => {
              const lignes = byRubrique[rubrique] || [];
              if (lignes.length === 0) return null;
              const total = totauxByRubrique[rubrique];
              return (
                <>
                  <tr key={`${rubrique}-head`} className="border-t border-paper-200 bg-paper-50/60">
                    <td colSpan={4} className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-widest text-ink-700 font-bold">
                      {rubrique}
                    </td>
                  </tr>
                  {lignes.map((l, i) => (
                    <tr key={`${rubrique}-${i}`} className="hover:bg-paper-50/40">
                      <td className="px-5 py-1.5 text-ink-700">
                        {l.poste}
                        {l.ratio_commentaire && (
                          <span className="text-[10px] text-ink-500 ml-2 italic">({l.ratio_commentaire})</span>
                        )}
                      </td>
                      <td className="px-5 py-1.5 text-right text-ink-900 tabular-nums">{l.brs ? formatEuro(l.brs) : "—"}</td>
                      <td className="px-5 py-1.5 text-right text-ink-900 tabular-nums">{l.pli ? formatEuro(l.pli) : "—"}</td>
                      <td className="px-5 py-1.5 text-right text-ink-900 tabular-nums font-medium">{formatEuro(l.total)}</td>
                    </tr>
                  ))}
                  {total && (
                    <tr key={`${rubrique}-total`} className="bg-brand-50/40 border-t border-brand-500/20">
                      <td className="px-5 py-1.5 text-ink-900 font-medium italic">Sous-total {rubrique.toLowerCase()}</td>
                      <td className="px-5 py-1.5 text-right font-medium tabular-nums">{formatEuro(total.brs)}</td>
                      <td className="px-5 py-1.5 text-right font-medium tabular-nums">{formatEuro(total.pli)}</td>
                      <td className="px-5 py-1.5 text-right font-medium tabular-nums text-brand-700">{formatEuro(total.total)}</td>
                    </tr>
                  )}
                </>
              );
            })}
            {/* PR total */}
            <tr className="border-t-2 border-brand-700 bg-brand-50">
              <td className="px-5 py-3 font-serif text-ink-900 font-bold">PRIX REVIENT HT</td>
              <td className="px-5 py-3 text-right font-serif font-bold tabular-nums">
                {brs ? formatEuro(brs.prix_revient_ht) : ""}
              </td>
              <td className="px-5 py-3 text-right font-serif font-bold tabular-nums">
                {pli ? formatEuro(pli.prix_revient_ht) : ""}
              </td>
              <td className="px-5 py-3 text-right font-serif font-bold tabular-nums text-brand-700">
                {formatEuro(bilan.prix_revient_ht_total)}
              </td>
            </tr>
            <tr>
              <td className="px-5 py-2 text-ink-700">Prix de vente HT</td>
              <td className="px-5 py-2 text-right tabular-nums">{brs ? formatEuro(brs.prix_vente_ht) : ""}</td>
              <td className="px-5 py-2 text-right tabular-nums">{pli ? formatEuro(pli.prix_vente_ht) : ""}</td>
              <td className="px-5 py-2 text-right tabular-nums font-medium">{formatEuro(bilan.prix_vente_ht_total)}</td>
            </tr>
            <tr>
              <td className="px-5 py-2 text-ink-700">
                Marge brute <span className="text-[10px] text-ink-500 italic">(hors subventions)</span>
              </td>
              <td className={`px-5 py-2 text-right tabular-nums ${brs && brs.marge_brute < 0 ? "text-danger-500" : ""}`}>
                {brs ? formatEuro(brs.marge_brute) : ""}
              </td>
              <td className={`px-5 py-2 text-right tabular-nums ${pli && pli.marge_brute < 0 ? "text-danger-500" : ""}`}>
                {pli ? formatEuro(pli.marge_brute) : ""}
              </td>
              <td className={`px-5 py-2 text-right tabular-nums ${bilan.marge_brute_totale < 0 ? "text-danger-500 font-medium" : "font-medium"}`}>
                {formatEuro(bilan.marge_brute_totale)}
              </td>
            </tr>
            <tr>
              <td className="px-5 py-2 text-ink-700 italic">+ Subventions</td>
              <td className="px-5 py-2 text-right tabular-nums text-ok-500">{brs ? `+${formatEuro(brs.subventions)}` : ""}</td>
              <td className="px-5 py-2 text-right tabular-nums text-ok-500">{pli ? `+${formatEuro(pli.subventions)}` : ""}</td>
              <td className="px-5 py-2 text-right tabular-nums text-ok-500 font-medium">+{formatEuro(bilan.subventions_totales)}</td>
            </tr>
            <tr className="border-t-2 border-ok-500/40 bg-ok-50/40">
              <td className="px-5 py-3 font-serif font-bold text-ok-500">MARGE NETTE</td>
              <td className="px-5 py-3 text-right font-serif font-bold tabular-nums text-ok-500">
                {brs ? formatEuro(brs.marge_nette) : ""} <span className="text-xs">({brs?.marge_nette_pct} %)</span>
              </td>
              <td className="px-5 py-3 text-right font-serif font-bold tabular-nums text-ok-500">
                {pli ? formatEuro(pli.marge_nette) : ""} <span className="text-xs">({pli?.marge_nette_pct} %)</span>
              </td>
              <td className="px-5 py-3 text-right font-serif font-bold tabular-nums text-ok-500">
                {formatEuro(bilan.marge_nette_totale)}{" "}
                <span className="text-xs">({bilan.marge_nette_pct.toString().replace(".", ",")} %)</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Subventions détail */}
      {bilan.subventions_detail.length > 0 && (
        <div className="rounded-sm border border-paper-200 bg-white p-5 mb-6">
          <div className="text-[10px] uppercase tracking-widest text-ink-500 mb-3">
            Détail des subventions institutionnelles
          </div>
          <ul className="space-y-2 text-sm">
            {bilan.subventions_detail.map((s, i) => (
              <li key={i} className="flex justify-between border-b border-paper-200 pb-2 last:border-b-0">
                <span className="text-ink-700">
                  <span className="text-[10px] uppercase tracking-widest mr-2 text-ink-500">{s.volet}</span>
                  {s.source}
                </span>
                <span className="tabular-nums font-medium text-ok-500">+{formatEuro(s.montant)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
