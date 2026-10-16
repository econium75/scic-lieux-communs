"use client";
import { Fragment } from "react";
import { PRODUITS, RUBRIQUES, type Produit } from "@/lib/simulateur";
import { cn } from "@/lib/format";
import { ReadOnlyBanner, Section, eur, pct, th, td, tdNum } from "./ui";
import type { TabProps } from "./tab-props";

export function TabBilanOperation({ result, goTo }: TabProps) {
  const b = result.bilan_operation;
  const pp = result.programme.par_produit;
  const actifs = PRODUITS.filter((p) => pp[p].nb > 0 || b.ttc[p] !== 0);
  const cols: Produit[] = actifs.length ? actifs : [...PRODUITS];

  const row = (label: string, vals: Record<string, number>, cls = "", fmt: (v: number) => string = (v) => eur(v)) => (
    <tr className={cn("border-t border-paper-200", cls)}>
      <td className={`${td} whitespace-normal`}>{label}</td>
      {cols.map((p) => <td key={p} className={tdNum}>{fmt(vals[p] ?? 0)}</td>)}
      <td className={tdNum}>{fmt(vals.total ?? 0)}</td>
    </tr>
  );
  const titre = (t: string) => (
    <tr className="border-t border-paper-200 bg-paper-50">
      <td colSpan={cols.length + 2} className="px-3 py-1.5 text-[11px] uppercase tracking-widest text-ink-500 font-semibold">{t}</td>
    </tr>
  );
  const ok = Math.abs(b.controle.total) < 1;

  return (
    <div>
      <ReadOnlyBanner>
        Onglet calculé, non modifiable : récapitulatif du prix de revient (onglet 3) et du plan de financement (onglet 4).
        <button onClick={() => goTo("prix-revient")} className="text-brand-500 hover:underline ml-1">Modifier le prix de revient</button>·
        <button onClick={() => goTo("financement")} className="text-brand-500 hover:underline">le financement</button>
      </ReadOnlyBanner>

      <Section title="Bilan d'opération — emplois et ressources">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper-50">
              <tr>
                <th className={`${th} text-left min-w-[260px]`} />
                {cols.map((p) => <th key={p} className={`${th} text-right min-w-[120px]`}>{p}</th>)}
                <th className={`${th} text-right min-w-[120px]`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {titre("Emplois — prix de revient")}
              {RUBRIQUES.map((r) => (
                <Fragment key={r}>{row(r.charAt(0) + r.slice(1).toLowerCase(), b.emplois[r], "text-ink-700")}</Fragment>
              ))}
              {row("Sous-total HT", b.ht, "font-semibold bg-paper-50")}
              {row("TVA", b.tva, "text-ink-700")}
              {row("TOTAL PRIX DE REVIENT TTC", b.ttc, "font-semibold bg-brand-50 text-ink-900")}
              {row("Prix de revient / logement", b.par_logement, "text-ink-500")}
              {row("Prix de revient / m² SHAB", b.par_m2_shab, "text-ink-500")}

              {titre("Ressources — financement")}
              {b.ressources.filter((l) => l.total !== 0).map((l) => (
                <tr key={l.libelle} className="border-t border-paper-200 text-ink-700">
                  <td className={`${td} whitespace-normal`}>{l.libelle}</td>
                  {cols.map((p) => <td key={p} className={tdNum}>{eur(l.montants[p])}</td>)}
                  <td className={tdNum}>{eur(l.total)}</td>
                </tr>
              ))}
              {b.cession_affectee.total !== 0 && row("Cession affectée (BRS)", b.cession_affectee, "text-ink-700")}
              {row("Emprunt d'équilibre", b.emprunt_equilibre, "text-ink-900")}
              {row("TOTAL RESSOURCES", b.total_ressources, "font-semibold bg-brand-50 text-ink-900")}
              <tr className="border-t border-paper-200">
                <td className={td}>Écart ressources − emplois (contrôle)</td>
                {cols.map((p) => (
                  <td key={p} className={cn(tdNum, Math.abs(b.controle[p]) > 1 ? "text-danger-500 font-semibold" : "text-ok-500")}>
                    {Math.abs(b.controle[p]) > 1 ? eur(b.controle[p]) : "0 €"}
                  </td>
                ))}
                <td className={cn(tdNum, ok ? "text-ok-500" : "text-danger-500 font-semibold")}>{ok ? "0 €" : eur(b.controle.total)}</td>
              </tr>

              {titre("Structure du financement (% du prix de revient TTC)")}
              {row("Subventions", b.structure.subventions, "text-ink-700", (v) => pct(v))}
              {row("Fonds propres", b.structure.fonds_propres, "text-ink-700", (v) => pct(v))}
              {row("Emprunts", b.structure.emprunts, "text-ink-700", (v) => pct(v))}
              {b.structure.cession.total !== 0 && row("Cession BRS", b.structure.cession, "text-ink-700", (v) => pct(v))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
