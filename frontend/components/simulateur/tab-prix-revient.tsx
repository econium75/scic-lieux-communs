"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { PRODUITS, RUBRIQUES, nouvelId, type Produit } from "@/lib/simulateur";
import { Btn, NumInput, Section, Select, TextInput, eur, pct, th, td, tdNum } from "./ui";
import type { TabProps } from "./tab-props";

export function TabPrixRevient({ opId, data, result, update, replace, canEdit }: TabProps) {
  const pr = result.prix_revient;
  const pp = result.programme.par_produit;
  const max = result.limites.lignes_supplementaires;
  const nbCustom = data.prix_revient.lignes.filter((l) => l.custom).length;
  const [tous, setTous] = useState(false);
  const [busy, setBusy] = useState(false);

  // Par défaut on n'affiche que les produits programmés ou déjà chiffrés
  const actifs = useMemo(() => {
    const a = PRODUITS.filter((p) => pp[p].nb > 0 || pr.ht[p] !== 0);
    return a.length ? a : [...PRODUITS];
  }, [pp, pr.ht]);
  const cols: Produit[] = tous ? [...PRODUITS] : actifs;

  const setMontant = (id: string, p: Produit, v: number) =>
    update((d) => {
      const l = d.prix_revient.lignes.find((x) => x.id === id);
      if (l) l.montants[p] = v;
    });

  const ajouter = () =>
    update((d) => {
      d.prix_revient.lignes.push({
        id: nouvelId("dep"),
        rubrique: "GESTION ET MOD",
        libelle: "Nouvelle dépense",
        montants: { PLAI: 0, PLUS: 0, PLS: 0, PLI: 0, BRS: 0 },
        custom: true,
      });
    });

  const prefill = async () => {
    if (!confirm("Remplacer les postes « Acquisition foncier », « Entreprise générale TCE », « Maîtrise d'œuvre », « Aléas travaux » et « Frais divers » par l'estimation issue des hypothèses (ratios × SHAB) ?")) return;
    setBusy(true);
    try {
      const r = await api.prefillPrixRevient(opId, data);
      replace(r.data);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Section
        title="Prix de revient détaillé (€ HT)"
        subtitle="Saisie manuelle par poste et par produit ; les totaux, la TVA et les ratios se calculent automatiquement."
        actions={
          <>
            <label className="text-xs text-ink-500 inline-flex items-center gap-1.5 mr-2">
              <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} />
              Afficher les 5 produits
            </label>
            {canEdit && (
              <>
                <Btn onClick={prefill} disabled={busy} title="Estimation à partir des ratios de l'onglet Hypothèses">
                  <Wand2 size={13} /> Pré-remplir depuis les hypothèses
                </Btn>
                <Btn onClick={ajouter} disabled={nbCustom >= max} variant="primary">
                  <Plus size={13} /> Ajouter une ligne de dépense ({nbCustom}/{max})
                </Btn>
              </>
            )}
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper-50 sticky top-0 z-10">
              <tr>
                <th className={`${th} text-left min-w-[260px]`}>Poste</th>
                {cols.map((p) => (
                  <th key={p} className={`${th} text-right min-w-[120px]`}>
                    {p}
                    <span className="block normal-case tracking-normal text-[11px] text-ink-300">{pp[p].nb} logts</span>
                  </th>
                ))}
                <th className={`${th} text-right min-w-[120px]`}>Total</th>
                {canEdit && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {RUBRIQUES.map((rub) => (
                <RubriqueBloc key={rub} rub={rub} cols={cols} {...{ data, result, canEdit, setMontant, update }} />
              ))}
              <tr className="border-t-2 border-ink-300 bg-paper-100 font-semibold">
                <td className={td}>Prix de revient HT</td>
                {cols.map((p) => <td key={p} className={tdNum}>{eur(pr.ht[p])}</td>)}
                <td className={tdNum}>{eur(pr.ht.total)}</td>
                {canEdit && <td />}
              </tr>
              <tr className="border-t border-paper-200 text-ink-700">
                <td className={td}>Taux de TVA non récupérable <span className="text-[11px] text-ink-500">(onglet Hypothèses)</span></td>
                {cols.map((p) => <td key={p} className={tdNum}>{pct(pr.taux_tva[p])}</td>)}
                <td />
                {canEdit && <td />}
              </tr>
              <tr className="border-t border-paper-200 text-ink-700">
                <td className={td}>TVA</td>
                {cols.map((p) => <td key={p} className={tdNum}>{eur(pr.tva[p])}</td>)}
                <td className={tdNum}>{eur(pr.tva.total)}</td>
                {canEdit && <td />}
              </tr>
              <tr className="border-t border-ink-300 bg-brand-50 font-semibold text-ink-900">
                <td className={td}>PRIX DE REVIENT TTC</td>
                {cols.map((p) => <td key={p} className={tdNum}>{eur(pr.ttc[p])}</td>)}
                <td className={tdNum}>{eur(pr.ttc.total)}</td>
                {canEdit && <td />}
              </tr>
              <tr className="border-t border-paper-200 text-ink-700">
                <td className={td}>Prix de revient TTC / logement</td>
                {cols.map((p) => <td key={p} className={tdNum}>{eur(pr.par_logement[p])}</td>)}
                <td className={tdNum}>{eur(pr.par_logement.total)}</td>
                {canEdit && <td />}
              </tr>
              <tr className="border-t border-paper-200 text-ink-700">
                <td className={td}>Prix de revient TTC / m² SHAB</td>
                {cols.map((p) => <td key={p} className={tdNum}>{eur(pr.par_m2_shab[p])}</td>)}
                <td className={tdNum}>{eur(pr.par_m2_shab.total)}</td>
                {canEdit && <td />}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function RubriqueBloc({
  rub,
  cols,
  data,
  result,
  canEdit,
  setMontant,
  update,
}: {
  rub: string;
  cols: Produit[];
  canEdit: boolean;
  setMontant: (id: string, p: Produit, v: number) => void;
} & Pick<TabProps, "data" | "result" | "update">) {
  const tot = result.prix_revient.par_rubrique[rub];
  const lignes = data.prix_revient.lignes.filter((l) => l.rubrique === rub);
  const calc = Object.fromEntries(result.prix_revient.lignes.map((l) => [l.id, l.total_ht]));
  return (
    <>
      <tr className="border-t border-paper-200 bg-paper-50 font-semibold text-ink-900">
        <td className={`${td} text-[11px] uppercase tracking-widest`}>{rub}</td>
        {cols.map((p) => <td key={p} className={tdNum}>{eur(tot?.[p] ?? 0)}</td>)}
        <td className={tdNum}>{eur(tot?.total ?? 0)}</td>
        {canEdit && <td />}
      </tr>
      {lignes.map((l) => (
        <tr key={l.id} className="border-t border-paper-200 hover:bg-paper-50/50">
          <td className="px-3 py-1 pl-6">
            {l.custom && canEdit ? (
              <div className="flex gap-1.5">
                <TextInput value={l.libelle} onChange={(v) => update((d) => void (d.prix_revient.lignes.find((x) => x.id === l.id)!.libelle = v))} />
                <Select
                  value={l.rubrique}
                  onChange={(v) => update((d) => void (d.prix_revient.lignes.find((x) => x.id === l.id)!.rubrique = v))}
                  options={RUBRIQUES}
                  className="w-40 text-xs"
                />
              </div>
            ) : (
              <span className="text-ink-700">
                {l.libelle}
                {l.custom && <span className="ml-2 text-[11px] text-brand-500">ligne ajoutée</span>}
              </span>
            )}
          </td>
          {cols.map((p) => (
            <td key={p} className="px-2 py-1">
              <NumInput value={l.montants[p]} onChange={(v) => setMontant(l.id, p, v ?? 0)} disabled={!canEdit} decimals={2} ariaLabel={`${l.libelle} ${p}`} />
            </td>
          ))}
          <td className={`${tdNum} text-ink-900`}>{eur(calc[l.id] ?? 0)}</td>
          {canEdit && (
            <td className="px-1">
              {l.custom && (
                <button
                  onClick={() => update((d) => void (d.prix_revient.lignes = d.prix_revient.lignes.filter((x) => x.id !== l.id)))}
                  className="p-1 text-ink-300 hover:text-danger-500"
                  title="Supprimer la ligne"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
