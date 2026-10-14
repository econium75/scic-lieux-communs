"use client";
import { useState } from "react";
import { Scale } from "lucide-react";
import { api } from "@/lib/api";
import { PRODUITS, ZONES_123, ZONES_ABC, type Hypotheses, type Produit } from "@/lib/simulateur";
import { Btn, Field, NumInput, Section, Select, TextInput, eur, num, th, td, tdNum } from "./ui";
import type { TabProps } from "./tab-props";

export function TabHypotheses({ opId, data, result, update, replace, canEdit }: TabProps) {
  const h = data.hypotheses;
  const b = result.bareme;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Hypotheses>(k: K, v: Hypotheses[K]) => update((d) => void (d.hypotheses[k] = v));
  const n = (v: number | null) => v ?? 0;

  const maxLoyer: Record<Produit, number | undefined> = {
    PLAI: b.loyers_plai[h.zone_123],
    PLUS: b.loyers_plus[h.zone_123],
    PLS: b.loyers_pls[h.zone_abc],
    PLI: b.loyers_pli[h.zone_abc],
    BRS: undefined,
  };
  const t = b.taux;
  const tauxBareme: Record<Produit, number> = {
    PLAI: t.livret_a + t.marge_plai,
    PLUS: t.livret_a + t.marge_plus,
    PLS: t.livret_a + t.marge_pls,
    PLI: t.taux_fixe_pli,
    BRS: t.livret_a + t.marge_foncier_brs,
  };

  const appliquer = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.appliquerBareme(opId, data);
      replace(r.data);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Section title="Identification de l'opération">
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Nom de l'opération">
            <TextInput value={h.nom_operation} onChange={(v) => set("nom_operation", v)} disabled={!canEdit} />
          </Field>
          <Field label="Commune">
            <TextInput value={h.commune} onChange={(v) => set("commune", v)} disabled={!canEdit} />
          </Field>
          <Field label="Zone loyers PLAI / PLUS" hint="Zonage 1bis / 1 / 2 / 3">
            <Select value={h.zone_123} onChange={(v) => set("zone_123", v)} options={ZONES_123} disabled={!canEdit} />
          </Field>
          <Field label="Zone A / B / C" hint="PLS, PLI, plafonds BRS">
            <Select value={h.zone_abc} onChange={(v) => set("zone_abc", v)} options={ZONES_ABC} disabled={!canEdit} />
          </Field>
          <Field label="Année de livraison prévisionnelle">
            <NumInput value={h.annee_livraison} onChange={(v) => set("annee_livraison", Math.round(n(v)))} decimals={0} disabled={!canEdit} align="left" grouping={false} />
          </Field>
          <Field label="Durée de projection (ans)">
            <NumInput value={h.duree_projection} onChange={(v) => set("duree_projection", Math.round(n(v)))} decimals={0} disabled={!canEdit} />
          </Field>
          <Field label="Millésime des barèmes" hint="Base de l'indexation des loyers">
            <NumInput value={h.annee_bareme} onChange={() => {}} decimals={0} disabled align="left" grouping={false} />
          </Field>
        </div>
      </Section>

      <Section
        title={`Barèmes réglementaires ${b.millesime} — zones ${h.zone_123} / ${h.zone_abc}`}
        subtitle="Référence modifiable par l'administrateur (Référentiels → Paramètres). Les hypothèses peuvent être inférieures aux maxima."
        actions={
          canEdit && (
            <Btn onClick={appliquer} disabled={busy}>
              <Scale size={13} /> {busy ? "Application…" : "Appliquer le barème aux hypothèses"}
            </Btn>
          )
        }
      >
        {err && <div className="px-5 py-2 text-xs text-danger-500">{err}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper-50">
              <tr>
                <th className={`${th} text-left`}>Produit</th>
                <th className={`${th} text-right`}>Loyer max (€/m² SU/mois)</th>
                <th className={`${th} text-right`}>Loyer retenu</th>
                <th className={`${th} text-right`}>Taux barème</th>
                <th className={`${th} text-right`}>Taux retenu</th>
              </tr>
            </thead>
            <tbody>
              {PRODUITS.map((p) => {
                const depasse = maxLoyer[p] !== undefined && h.loyer_plafond[p] > (maxLoyer[p] as number) + 1e-9;
                return (
                  <tr key={p} className="border-t border-paper-200">
                    <td className={`${td} font-medium text-ink-900`}>{p}</td>
                    <td className={tdNum}>{maxLoyer[p] !== undefined ? num(maxLoyer[p], 2) : p === "BRS" ? "redevance libre" : "—"}</td>
                    <td className={`${tdNum} ${depasse ? "text-danger-500 font-semibold" : ""}`}>{num(h.loyer_plafond[p], 2)}</td>
                    <td className={tdNum}>{(tauxBareme[p] * 100).toFixed(2).replace(".", ",")} %</td>
                    <td className={tdNum}>{(h.prets[p].taux * 100).toFixed(2).replace(".", ",")} %</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 text-xs text-ink-500 border-t border-paper-200 flex flex-wrap gap-x-6 gap-y-1">
          <span>Livret A : {(t.livret_a * 100).toFixed(2).replace(".", ",")} %</span>
          <span>Prix plafond BRS zone {h.zone_abc} : {eur(b.brs_prix_plafond_m2_su[h.zone_abc])} HT/m² SU</span>
          <span>Plafond subvention État : PLAI {eur(b.regles.plafond_subv_etat_plai_logt)} · PLUS {eur(b.regles.plafond_subv_etat_plus_logt)} /logt</span>
        </div>
      </Section>

      <Section title="Coûts de l'opération (HT)" subtitle="Servent au pré-remplissage du prix de revient détaillé (onglet 3).">
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Charge foncière (€/m² SHAB)">
            <NumInput value={h.charge_fonciere_m2} onChange={(v) => set("charge_fonciere_m2", n(v))} disabled={!canEdit} suffix="€" />
          </Field>
          <Field label="Travaux bâtiment + VRD (€/m² SHAB)">
            <NumInput value={h.travaux_m2} onChange={(v) => set("travaux_m2", n(v))} disabled={!canEdit} suffix="€" />
          </Field>
          <Field label="Honoraires (% du coût travaux)">
            <NumInput value={h.honoraires_pct} onChange={(v) => set("honoraires_pct", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Aléas / imprévus (% du coût travaux)">
            <NumInput value={h.aleas_pct} onChange={(v) => set("aleas_pct", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Frais annexes — raccordements, DO, taxe d'aménagement (€/logement)">
            <NumInput value={h.frais_annexes_logt} onChange={(v) => set("frais_annexes_logt", n(v))} disabled={!canEdit} suffix="€" />
          </Field>
          <Field label="Décote foncière BRS (% de la charge foncière)">
            <NumInput value={h.decote_fonciere_brs_pct} onChange={(v) => set("decote_fonciere_brs_pct", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
        </div>
        <div className="px-4 sm:px-5 pb-5">
          <div className="text-[11px] text-ink-700 mb-2">TVA non récupérable sur le prix de revient</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {PRODUITS.map((p) => (
              <Field key={p} label={p}>
                <NumInput value={h.tva[p]} onChange={(v) => update((d) => void (d.hypotheses.tva[p] = n(v)))} scale={100} disabled={!canEdit} suffix="%" />
              </Field>
            ))}
            <Field label="Cession BRS">
              <NumInput value={h.tva_cession_brs} onChange={(v) => set("tva_cession_brs", n(v))} scale={100} disabled={!canEdit} suffix="%" />
            </Field>
          </div>
          <p className="text-[10px] text-ink-500 mt-2">
            BRS : coûts saisis HT (TVA récupérable), la cession des droits réels est soumise à la TVA de cession.
          </p>
        </div>
      </Section>

      <Section title="Financement / ressources" subtitle="Valeurs par défaut du plan de financement (onglet 4), modifiables cellule par cellule.">
        <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PRODUITS.map((p) => (
            <Field key={p} label={`Subvention État ${p} (€/logt)`}>
              <NumInput value={h.subv_etat_logt[p]} onChange={(v) => update((d) => void (d.hypotheses.subv_etat_logt[p] = n(v)))} disabled={!canEdit} decimals={0} />
            </Field>
          ))}
          <Field label="Subvention collectivités (€/logt)">
            <NumInput value={h.subv_collectivites_logt} onChange={(v) => set("subv_collectivites_logt", n(v))} disabled={!canEdit} decimals={0} />
          </Field>
          <Field label="Subvention Action Logement (€/logt)">
            <NumInput value={h.subv_action_logement_logt} onChange={(v) => set("subv_action_logement_logt", n(v))} disabled={!canEdit} decimals={0} />
          </Field>
          <Field label="Fonds propres cible (% PR TTC)">
            <NumInput value={h.fonds_propres_pct} onChange={(v) => set("fonds_propres_pct", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Prix de vente BRS (€ HT/m² SU)" hint={`Plafond zone ${h.zone_abc} : ${eur(b.brs_prix_plafond_m2_su[h.zone_abc])}`}>
            <NumInput value={h.prix_vente_brs_m2_su} onChange={(v) => set("prix_vente_brs_m2_su", n(v))} disabled={!canEdit} decimals={0} suffix="€" />
          </Field>
        </div>

        <div className="overflow-x-auto border-t border-paper-200">
          <table className="w-full text-sm">
            <thead className="bg-paper-50">
              <tr>
                <th className={`${th} text-left`}>Prêt principal</th>
                <th className={`${th} text-right`}>Taux</th>
                <th className={`${th} text-right`}>Durée construction (ans)</th>
                <th className={`${th} text-right`}>Durée foncier (ans)</th>
              </tr>
            </thead>
            <tbody>
              {PRODUITS.map((p) => (
                <tr key={p} className="border-t border-paper-200">
                  <td className={`${td} font-medium text-ink-900`}>{p === "BRS" ? "BRS — portage foncier OFS" : `${p} (CDC)`}</td>
                  <td className="px-3 py-1 w-36">
                    <NumInput value={h.prets[p].taux} onChange={(v) => update((d) => void (d.hypotheses.prets[p].taux = n(v)))} scale={100} decimals={3} disabled={!canEdit} suffix="%" />
                  </td>
                  <td className="px-3 py-1 w-36">
                    {p === "BRS" ? (
                      <span className="block text-right text-xs text-ink-500">100 % foncier</span>
                    ) : (
                      <NumInput value={h.prets[p].duree} onChange={(v) => update((d) => void (d.hypotheses.prets[p].duree = Math.round(n(v))))} decimals={0} disabled={!canEdit} />
                    )}
                  </td>
                  <td className="px-3 py-1 w-36">
                    <NumInput value={h.prets[p].duree_foncier} onChange={(v) => update((d) => void (d.hypotheses.prets[p].duree_foncier = Math.round(n(v))))} decimals={0} disabled={!canEdit} />
                  </td>
                </tr>
              ))}
              {(
                [
                  ["pret_cnav", "Prêt CNAV"],
                  ["pret_action_logement", "Prêt Action Logement"],
                  ["pret_complementaire", "Prêt complémentaire (CPLS, bancaire…)"],
                ] as const
              ).map(([k, lib]) => (
                <tr key={k} className="border-t border-paper-200">
                  <td className={`${td} text-ink-900`}>{lib}</td>
                  <td className="px-3 py-1">
                    <NumInput value={h[k].taux} onChange={(v) => update((d) => void (d.hypotheses[k].taux = n(v)))} scale={100} decimals={3} disabled={!canEdit} suffix="%" />
                  </td>
                  <td className="px-3 py-1">
                    <NumInput value={h[k].duree} onChange={(v) => update((d) => void (d.hypotheses[k].duree = Math.round(n(v))))} decimals={0} disabled={!canEdit} />
                  </td>
                  <td className="px-3 py-1 text-xs text-ink-300 text-right">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 sm:p-5 border-t border-paper-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Quotité foncière du prêt principal">
            <Select
              value={h.quotite_fonciere_mode}
              onChange={(v) => set("quotite_fonciere_mode", v as Hypotheses["quotite_fonciere_mode"])}
              options={[
                { value: "prorata", label: "Au prorata de la charge foncière dans le PR" },
                { value: "pct_charge_fonciere", label: "% de la charge foncière HT" },
              ]}
              disabled={!canEdit}
            />
          </Field>
          {h.quotite_fonciere_mode === "pct_charge_fonciere" && (
            <Field label="Part de la charge foncière financée en prêt foncier">
              <NumInput value={h.quotite_fonciere_pct} onChange={(v) => set("quotite_fonciere_pct", n(v))} scale={100} disabled={!canEdit} suffix="%" />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Loyers / redevance et exploitation">
        <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PRODUITS.map((p) => (
            <Field
              key={p}
              label={p === "BRS" ? "Redevance BRS (€/m² SU/mois)" : `Loyer ${p} (€/m² SU/mois)`}
              hint={maxLoyer[p] !== undefined ? `max ${num(maxLoyer[p], 2)} €` : undefined}
            >
              <NumInput value={h.loyer_plafond[p]} onChange={(v) => update((d) => void (d.hypotheses.loyer_plafond[p] = n(v)))} disabled={!canEdit} />
            </Field>
          ))}
        </div>
        <div className="px-4 sm:px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Field label="Indexation des loyers (IRL)">
            <NumInput value={h.indexation_loyers} onChange={(v) => set("indexation_loyers", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Vacance locative">
            <NumInput value={h.vacance} onChange={(v) => set("vacance", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Impayés nets">
            <NumInput value={h.impayes} onChange={(v) => set("impayes", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Frais de gestion (% loyers encaissés)">
            <NumInput value={h.frais_gestion_pct} onChange={(v) => set("frais_gestion_pct", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Inflation des charges">
            <NumInput value={h.inflation_charges} onChange={(v) => set("inflation_charges", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Entretien courant (€/logt/an)">
            <NumInput value={h.entretien_logt} onChange={(v) => set("entretien_logt", n(v))} disabled={!canEdit} decimals={0} />
          </Field>
          <Field label="Provision gros entretien (€/logt/an)">
            <NumInput value={h.pge_logt} onChange={(v) => set("pge_logt", n(v))} disabled={!canEdit} decimals={0} />
          </Field>
          <Field label="Assurances (€/logt/an)">
            <NumInput value={h.assurance_logt} onChange={(v) => set("assurance_logt", n(v))} disabled={!canEdit} decimals={0} />
          </Field>
          <Field label="TFPB plein tarif (€/logt/an)">
            <NumInput value={h.tfpb_logt} onChange={(v) => set("tfpb_logt", n(v))} disabled={!canEdit} decimals={0} />
          </Field>
          <Field label="Exonération TFPB PLAI/PLUS/PLS (ans)" hint="PLI assujetti dès l'année 1">
            <NumInput value={h.exoneration_tfpb_ans} onChange={(v) => set("exoneration_tfpb_ans", Math.round(n(v)))} decimals={0} disabled={!canEdit} />
          </Field>
          <Field label="Parkings (nombre)">
            <NumInput value={h.parkings_nb} onChange={(v) => set("parkings_nb", Math.round(n(v)))} decimals={0} disabled={!canEdit} />
          </Field>
          <Field label="Loyer parking (€/mois)">
            <NumInput value={h.parking_loyer_mensuel} onChange={(v) => set("parking_loyer_mensuel", n(v))} disabled={!canEdit} />
          </Field>
          <Field label="RLS (€/logt/mois)">
            <NumInput value={h.rls_logt_mois} onChange={(v) => set("rls_logt_mois", n(v))} disabled={!canEdit} />
          </Field>
          <Field label="Logements concernés par la RLS">
            <NumInput value={h.rls_part_logements} onChange={(v) => set("rls_part_logements", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
          <Field label="Taux d'actualisation (VAN)">
            <NumInput value={h.taux_actualisation} onChange={(v) => set("taux_actualisation", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
        </div>
      </Section>

      <Section title="Surface utile (SU)" subtitle="SU = SHAB + MIN(surface annexe, plafond) × pondération. Les loyers s'entendent en €/m² de SU.">
        <div className="p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Plafond de surface annexe (m²/logement)">
            <NumInput value={h.annexe_plafond_m2} onChange={(v) => set("annexe_plafond_m2", n(v))} disabled={!canEdit} />
          </Field>
          <Field label="Pondération des surfaces annexes">
            <NumInput value={h.annexe_ponderation} onChange={(v) => set("annexe_ponderation", n(v))} scale={100} disabled={!canEdit} suffix="%" />
          </Field>
        </div>
      </Section>
    </div>
  );
}
