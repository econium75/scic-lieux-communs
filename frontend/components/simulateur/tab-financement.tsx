"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PRODUITS, nouvelId, type LigneFinCalc, type NatureFinancement, type Produit } from "@/lib/simulateur";
import { cn } from "@/lib/format";
import { Btn, NumInput, Section, Select, TextInput, eur, num, pct, th, td, tdNum } from "./ui";
import type { TabProps } from "./tab-props";

const NATURES: { value: NatureFinancement; label: string }[] = [
  { value: "subvention", label: "Subvention" },
  { value: "pret", label: "Prêt" },
  { value: "fonds_propres", label: "Fonds propres" },
];

export function TabFinancement({ data, result, update, canEdit }: TabProps) {
  const f = result.financement;
  const pr = result.prix_revient;
  const pp = result.programme.par_produit;
  const max = result.limites.financements_complementaires;
  const comps = data.financement.complementaires;
  const [tous, setTous] = useState(false);

  const actifs = useMemo(() => {
    const a = PRODUITS.filter((p) => pp[p].nb > 0 || pr.ttc[p] !== 0);
    return a.length ? a : [...PRODUITS];
  }, [pp, pr.ttc]);
  const cols: Produit[] = tous ? [...PRODUITS] : actifs;
  const calcParId = Object.fromEntries(f.lignes.map((l) => [l.id, l])) as Record<string, LigneFinCalc>;

  const baseIds = ["subv_etat", "subv_collectivites", "subv_action_logement", "fonds_propres", "fonds_propres_societaires", "pret_cnav", "pret_action_logement", "pret_complementaire"];
  const groupes: { titre: string; ids: string[] }[] = [
    { titre: "Subventions", ids: baseIds.slice(0, 3) },
    { titre: "Fonds propres", ids: baseIds.slice(3, 5) },
    { titre: "Prêts", ids: baseIds.slice(5) },
  ];
  const colSpan = cols.length + 2 + (canEdit ? 1 : 0);

  const ajouter = () =>
    update((d) => {
      d.financement.complementaires.push({
        id: nouvelId("fc"),
        libelle: "Financement complémentaire",
        nature: "subvention",
        montants: { PLAI: 0, PLUS: 0, PLS: 0, PLI: 0, BRS: 0 },
        taux: 0,
        duree: 20,
      });
    });

  const ligneTotal = (label: string, vals: Record<string, number>, cls = "", fmt: (v: number) => string = (v) => eur(v)) => (
    <tr className={cn("border-t border-paper-200", cls)}>
      <td className={td}>{label}</td>
      {cols.map((p) => <td key={p} className={tdNum}>{fmt(vals[p] ?? 0)}</td>)}
      <td className={tdNum}>{fmt(vals.total ?? 0)}</td>
      {canEdit && <td />}
    </tr>
  );

  return (
    <div>
      <Section
        title="Plan de financement par produit"
        subtitle="Cellules grises = calcul automatique (hypothèses) : saisir pour remplacer, vider pour revenir au calcul. L'emprunt principal est calculé par équilibre."
        actions={
          <>
            <label className="text-xs text-ink-500 inline-flex items-center gap-1.5 mr-2">
              <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} />
              Afficher les 5 produits
            </label>
            {canEdit && (
              <Btn onClick={ajouter} disabled={comps.length >= max} variant="primary">
                <Plus size={13} /> Ajouter un financement complémentaire ({comps.length}/{max})
              </Btn>
            )}
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper-50">
              <tr>
                <th className={`${th} text-left min-w-[280px]`}>Ressource</th>
                {cols.map((p) => (
                  <th key={p} className={`${th} text-right min-w-[125px]`}>{p}</th>
                ))}
                <th className={`${th} text-right min-w-[120px]`}>Total</th>
                {canEdit && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-brand-50 font-semibold text-ink-900">
                <td className={td}>Prix de revient TTC (emplois)</td>
                {cols.map((p) => <td key={p} className={tdNum}>{eur(pr.ttc[p])}</td>)}
                <td className={tdNum}>{eur(pr.ttc.total)}</td>
                {canEdit && <td />}
              </tr>

              {groupes.map((g) => (
                <GroupRows key={g.titre} titre={g.titre} colSpan={colSpan}>
                  {g.ids.map((id) => {
                    const c = calcParId[id];
                    if (!c) return null;
                    const saisies = data.financement.montants[id] || {};
                    const conditions = c.nature === "pret" && c.taux !== null ? ` — ${pct(c.taux, 2)} / ${c.duree} ans` : "";
                    return (
                      <tr key={id} className="border-t border-paper-200">
                        <td className={`${td} text-ink-700 pl-6 whitespace-normal`}>
                          {c.libelle}
                          <span className="text-[10px] text-ink-500">{conditions}</span>
                        </td>
                        {cols.map((p) => {
                          const auto = c.auto && (saisies[p] === null || saisies[p] === undefined);
                          return (
                            <td key={p} className="px-2 py-1">
                              <NumInput
                                value={saisies[p] ?? null}
                                nullable
                                placeholder={c.auto ? num(c.montants[p], 0) : "0"}
                                onChange={(v) => update((d) => void (d.financement.montants[id][p] = v))}
                                disabled={!canEdit}
                                decimals={2}
                                className={auto ? "[&_input]:italic [&_input]:placeholder:text-ink-500" : ""}
                                ariaLabel={`${c.libelle} ${p}`}
                              />
                              {!canEdit && auto && (
                                <span className="sr-only">{num(c.montants[p])}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className={`${tdNum} text-ink-900`}>{eur(c.total)}</td>
                        {canEdit && <td />}
                      </tr>
                    );
                  })}
                </GroupRows>
              ))}

              <GroupRows titre={`Financements complémentaires (${comps.length}/${max})`} colSpan={colSpan}>
                {comps.length === 0 && (
                  <tr className="border-t border-paper-200">
                    <td colSpan={colSpan} className="px-6 py-2 text-xs text-ink-500 italic">
                      Aucun — jusqu'à {max} financements (subvention, prêt ou fonds propres) peuvent être ajoutés.
                    </td>
                  </tr>
                )}
                {comps.map((c, i) => {
                  const calc = calcParId[c.id];
                  return (
                    <tr key={c.id} className="border-t border-paper-200 align-top">
                      <td className="px-3 py-1 pl-6">
                        {canEdit ? (
                          <div className="space-y-1">
                            <TextInput value={c.libelle} onChange={(v) => update((d) => void (d.financement.complementaires[i].libelle = v))} />
                            <div className="flex gap-1.5">
                              <Select
                                value={c.nature}
                                onChange={(v) => update((d) => void (d.financement.complementaires[i].nature = v as NatureFinancement))}
                                options={NATURES}
                                className="w-32 text-xs"
                              />
                              {c.nature === "pret" && (
                                <>
                                  <NumInput value={c.taux} onChange={(v) => update((d) => void (d.financement.complementaires[i].taux = v ?? 0))} scale={100} decimals={3} suffix="%" className="w-24" ariaLabel="taux" />
                                  <NumInput value={c.duree} onChange={(v) => update((d) => void (d.financement.complementaires[i].duree = Math.round(v ?? 0)))} decimals={0} suffix="ans" className="w-24" ariaLabel="durée" />
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-700">
                            {c.libelle}{" "}
                            <span className="text-[10px] text-ink-500">
                              ({NATURES.find((n) => n.value === c.nature)?.label}
                              {c.nature === "pret" ? ` — ${pct(c.taux, 2)} / ${c.duree} ans` : ""})
                            </span>
                          </span>
                        )}
                      </td>
                      {cols.map((p) => (
                        <td key={p} className="px-2 py-1">
                          <NumInput value={c.montants[p]} onChange={(v) => update((d) => void (d.financement.complementaires[i].montants[p] = v ?? 0))} disabled={!canEdit} decimals={2} ariaLabel={`${c.libelle} ${p}`} />
                        </td>
                      ))}
                      <td className={`${tdNum} text-ink-900`}>{eur(calc?.total ?? 0)}</td>
                      {canEdit && (
                        <td className="px-1 pt-2">
                          <button
                            onClick={() => update((d) => void (d.financement.complementaires = d.financement.complementaires.filter((x) => x.id !== c.id)))}
                            className="p-1 text-ink-300 hover:text-danger-500"
                            title="Supprimer ce financement"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </GroupRows>

              <GroupRows titre="Calculs automatiques" colSpan={colSpan}>
                {ligneTotal("Cession affectée au bâti (BRS)", f.cession_affectee, "text-ink-700")}
                {ligneTotal("EMPRUNT D'ÉQUILIBRE (prêt principal)", f.emprunt_equilibre, "font-semibold text-ink-900 bg-paper-50")}
                {ligneTotal("   dont quotité foncière", f.quotite_fonciere, "text-ink-500 text-xs")}
                {ligneTotal("   dont quotité construction", f.quotite_construction, "text-ink-500 text-xs")}
              </GroupRows>
              {ligneTotal("TOTAL RESSOURCES", f.total_ressources, "border-t-2 border-ink-300 bg-brand-50 font-semibold text-ink-900")}
              <tr className="border-t border-paper-200">
                <td className={td}>Contrôle : ressources − prix de revient</td>
                {cols.map((p) => (
                  <td key={p} className={cn(tdNum, Math.abs(f.controle[p]) > 1 ? "text-danger-500 font-semibold" : "text-ok-500")}>
                    {Math.abs(f.controle[p]) > 1 ? eur(f.controle[p]) : "équilibré"}
                  </td>
                ))}
                <td className={cn(tdNum, Math.abs(f.controle.total) > 1 ? "text-danger-500 font-semibold" : "text-ok-500")}>
                  {Math.abs(f.controle.total) > 1 ? eur(f.controle.total) : "équilibré"}
                </td>
                {canEdit && <td />}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {pp.BRS.nb > 0 && (
        <Section title="Cession des droits réels (BRS)" subtitle="La cession finance d'abord le coût du bâti ; le foncier reste porté par l'OFS (prêt foncier long).">
          <div className="p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[11px] text-ink-700 mb-1">Prix de vente saisi (€ HT/m² SU)</div>
              <NumInput
                value={data.hypotheses.prix_vente_brs_m2_su}
                onChange={(v) => update((d) => void (d.hypotheses.prix_vente_brs_m2_su = v ?? 0))}
                disabled={!canEdit}
                decimals={0}
                suffix="€"
              />
            </div>
            <Info label={`Prix plafond zone ${data.hypotheses.zone_abc}`} value={eur(f.cession_brs.prix_plafond_m2)} />
            <Info label="Prix retenu (€ HT/m² SU)" value={eur(f.cession_brs.prix_retenu_m2)} tone={f.cession_brs.plafonne ? "warn" : undefined} />
            <Info label="Surface utile BRS" value={`${num(f.cession_brs.su, 2)} m²`} />
            <Info label="Produit de cession HT" value={eur(f.cession_brs.produit_ht)} />
            <Info label="Produit de cession TTC" value={eur(f.cession_brs.produit_ttc)} />
            <Info label="Prix TTC moyen / logement" value={eur(f.cession_brs.prix_ttc_logt)} />
            <Info label="Coût du bâti (PR − foncier)" value={eur(f.cession_brs.cout_bati)} />
            <Info label="Cession affectée au bâti" value={eur(f.cession_brs.affectee)} />
            <Info label="Marge de cession" value={eur(f.cession_brs.marge)} tone={f.cession_brs.marge > 0 ? "ok" : undefined} />
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-5">
        <Section title="Structure du financement (% du prix de revient TTC)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper-50">
                <tr>
                  <th className={`${th} text-left`}>Ressource</th>
                  {cols.map((p) => <th key={p} className={`${th} text-right`}>{p}</th>)}
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Subventions", f.structure.subventions],
                    ["Fonds propres", f.structure.fonds_propres],
                    ["Emprunts", f.structure.emprunts],
                    ["Cession BRS", f.structure.cession],
                  ] as const
                ).map(([lib, v]) => (
                  <tr key={lib} className="border-t border-paper-200">
                    <td className={td}>{lib}</td>
                    {cols.map((p) => <td key={p} className={tdNum}>{pct(v[p])}</td>)}
                    <td className={tdNum}>{pct(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Prêts et annuités (1re année, annuités constantes)">
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-paper-50 sticky top-0">
                <tr>
                  <th className={`${th} text-left`}>Prêt</th>
                  <th className={`${th} text-right`}>Montant</th>
                  <th className={`${th} text-right`}>Taux</th>
                  <th className={`${th} text-right`}>Durée</th>
                  <th className={`${th} text-right`}>Annuité</th>
                </tr>
              </thead>
              <tbody>
                {f.prets.map((x, i) => (
                  <tr key={i} className="border-t border-paper-200">
                    <td className={`${td} text-ink-700 whitespace-normal`}>{x.libelle}</td>
                    <td className={tdNum}>{eur(x.montant)}</td>
                    <td className={tdNum}>{pct(x.taux, 2)}</td>
                    <td className={tdNum}>{x.duree} ans</td>
                    <td className={tdNum}>{eur(x.annuite)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-ink-300 font-semibold bg-paper-50">
                  <td className={td}>Total annuités année 1</td>
                  <td className={tdNum}>{eur(f.emprunts.total)}</td>
                  <td />
                  <td />
                  <td className={tdNum}>{eur(f.annuites_annee1.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function GroupRows({ titre, colSpan, children }: { titre: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-t border-paper-200 bg-paper-50">
        <td colSpan={colSpan} className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-500 font-semibold">
          {titre}
        </td>
      </tr>
      {children}
    </>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div>
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className={cn("tabular-nums mt-1 font-medium", tone === "ok" ? "text-ok-500" : tone === "warn" ? "text-warn-500" : "text-ink-900")}>{value}</div>
    </div>
  );
}
