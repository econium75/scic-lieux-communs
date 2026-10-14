"use client";
import { ListPlus, Plus, Trash2 } from "lucide-react";
import {
  CATEGORIES_RESERVATAIRES,
  PRODUITS,
  STATUTS_RESERVATION,
  TYPOLOGIES,
  nouvelId,
  type Reservation,
} from "@/lib/simulateur";
import { cn } from "@/lib/format";
import { Btn, Kpi, Section, Select, TextInput, pct, th } from "./ui";
import type { TabProps } from "./tab-props";

function ligneVide(partial: Partial<Reservation> = {}): Reservation {
  return {
    id: nouvelId("r"),
    logement: "",
    typologie: "T2",
    produit: "PLUS",
    categorie: "Non réservé (bailleur)",
    reservataire: "",
    convention: "",
    date_signature: "",
    date_echeance: "",
    mode: "Flux",
    statut: "Réservé",
    contact: "",
    observations: "",
    ...partial,
  };
}

export function TabReservations({ data, result, update, canEdit }: TabProps) {
  const rows = data.reservations;
  const r = result.reservations;
  const pp = result.programme.par_produit;
  const set = (i: number, k: keyof Reservation, v: string) => update((d) => void (d.reservations[i][k] = v));

  const generer = () => {
    // Une ligne par logement du programme, sans dupliquer les lignes existantes (même produit + typologie)
    update((d) => {
      const existants: Record<string, number> = {};
      for (const x of d.reservations) existants[`${x.produit}|${x.typologie}`] = (existants[`${x.produit}|${x.typologie}`] || 0) + 1;
      let n = d.reservations.length;
      for (const p of PRODUITS) {
        for (const row of d.programme[p]) {
          const deja = existants[`${p}|${row.typologie}`] || 0;
          for (let k = deja; k < row.nb; k++) {
            n += 1;
            d.reservations.push(ligneVide({ logement: `L${String(n).padStart(2, "0")}`, typologie: row.typologie, produit: p }));
          }
        }
      }
    });
  };

  const today = new Date();
  const proche = (iso: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    const jours = (d.getTime() - today.getTime()) / 86_400_000;
    return jours <= 183;
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Lignes saisies" value={`${r.nb_lignes}`} sub={`pour ${r.nb_logements_programme} logements au programme`} tone={r.nb_lignes > r.nb_logements_programme && r.nb_logements_programme ? "warn" : "default"} />
        <Kpi label="Logements réservés" value={`${r.nb_reserves}`} sub={`${pct(r.taux_reservation, 0)} du programme`} />
        {r.quotas.slice(0, 2).map((q) => (
          <Kpi key={q.libelle} label={q.libelle} value={pct(q.part, 0)} sub={`repère légal ≤ ${pct(q.plafond, 0)}`} tone={q.depasse ? "danger" : "ok"} />
        ))}
      </div>

      <Section
        title="Tableau de réservation des logements"
        subtitle="Saisie manuelle, une ligne par logement. Repères légaux : État ≤ 30 % (dont agents publics ≤ 5 %), communes et EPCI ≤ 20 %."
        actions={
          canEdit && (
            <>
              <Btn onClick={generer} title="Crée les lignes manquantes à partir du programme (onglet 2)">
                <ListPlus size={13} /> Générer depuis le programme
              </Btn>
              <Btn onClick={() => update((d) => void d.reservations.push(ligneVide({ logement: `L${String(d.reservations.length + 1).padStart(2, "0")}` })))} variant="primary">
                <Plus size={13} /> Ajouter une ligne
              </Btn>
            </>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper-50">
              <tr>
                {["Logement", "Typologie", "Produit", "Catégorie de réservataire", "Réservataire", "N° convention", "Signature", "Échéance", "Gestion", "Statut", "Contact", "Observations"].map((h) => (
                  <th key={h} className={`${th} text-left`}>{h}</th>
                ))}
                {canEdit && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-center text-sm text-ink-500 italic">
                    Aucune réservation saisie{canEdit ? " — utilisez « Générer depuis le programme » ou « Ajouter une ligne »." : "."}
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.id} className="border-t border-paper-200 align-top">
                  <td className="px-1.5 py-1 min-w-[80px]"><TextInput value={row.logement} onChange={(v) => set(i, "logement", v)} disabled={!canEdit} /></td>
                  <td className="px-1.5 py-1 min-w-[90px]"><Select value={row.typologie} onChange={(v) => set(i, "typologie", v)} options={TYPOLOGIES} disabled={!canEdit} /></td>
                  <td className="px-1.5 py-1 min-w-[85px]">
                    <Select value={row.produit} onChange={(v) => set(i, "produit", v)} options={PRODUITS} disabled={!canEdit} />
                    {pp[row.produit as keyof typeof pp]?.nb === 0 && <span className="text-[10px] text-warn-500">absent du programme</span>}
                  </td>
                  <td className="px-1.5 py-1 min-w-[210px]"><Select value={row.categorie} onChange={(v) => set(i, "categorie", v)} options={CATEGORIES_RESERVATAIRES} disabled={!canEdit} /></td>
                  <td className="px-1.5 py-1 min-w-[190px]"><TextInput value={row.reservataire} onChange={(v) => set(i, "reservataire", v)} disabled={!canEdit} placeholder="ex. Préfecture, Ville…" /></td>
                  <td className="px-1.5 py-1 min-w-[130px]"><TextInput value={row.convention} onChange={(v) => set(i, "convention", v)} disabled={!canEdit} /></td>
                  <td className="px-1.5 py-1 min-w-[130px]"><TextInput type="date" value={row.date_signature} onChange={(v) => set(i, "date_signature", v)} disabled={!canEdit} /></td>
                  <td className="px-1.5 py-1 min-w-[130px]">
                    <TextInput type="date" value={row.date_echeance} onChange={(v) => set(i, "date_echeance", v)} disabled={!canEdit} className={cn(proche(row.date_echeance) && "!border-warn-500 !bg-warn-50")} />
                  </td>
                  <td className="px-1.5 py-1 min-w-[85px]"><Select value={row.mode} onChange={(v) => set(i, "mode", v)} options={["Flux", "Stock"]} disabled={!canEdit} /></td>
                  <td className="px-1.5 py-1 min-w-[150px]"><Select value={row.statut} onChange={(v) => set(i, "statut", v)} options={STATUTS_RESERVATION} disabled={!canEdit} /></td>
                  <td className="px-1.5 py-1 min-w-[150px]"><TextInput value={row.contact} onChange={(v) => set(i, "contact", v)} disabled={!canEdit} /></td>
                  <td className="px-1.5 py-1 min-w-[200px]"><TextInput value={row.observations} onChange={(v) => set(i, "observations", v)} disabled={!canEdit} /></td>
                  {canEdit && (
                    <td className="px-1 pt-2">
                      <button
                        onClick={() => update((d) => void (d.reservations = d.reservations.filter((x) => x.id !== row.id)))}
                        className="p-1 text-ink-300 hover:text-danger-500"
                        title="Supprimer la ligne"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5">
        <Section title="Répartition par réservataire">
          <table className="w-full text-sm">
            <tbody>
              {r.par_categorie.length === 0 && (
                <tr><td className="px-4 py-3 text-xs text-ink-500 italic">—</td></tr>
              )}
              {r.par_categorie.map((c) => (
                <tr key={c.categorie} className="border-t border-paper-200 first:border-t-0">
                  <td className="px-4 py-1.5 text-ink-700">{c.categorie}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{c.nb}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-ink-500">{pct(c.part, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Repères légaux et échéances">
          <table className="w-full text-sm">
            <tbody>
              {r.quotas.map((q) => (
                <tr key={q.libelle} className="border-t border-paper-200 first:border-t-0">
                  <td className="px-4 py-1.5 text-ink-700">{q.libelle}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{pct(q.part, 0)} / {pct(q.plafond, 0)}</td>
                  <td className={cn("px-4 py-1.5 text-right text-xs font-medium", q.depasse ? "text-danger-500" : "text-ok-500")}>
                    {q.depasse ? "Dépassé" : "OK"}
                  </td>
                </tr>
              ))}
              {r.echeances_proches.map((e, i) => (
                <tr key={i} className="border-t border-paper-200">
                  <td className="px-4 py-1.5 text-ink-700" colSpan={2}>
                    Échéance {e.reservataire || e.logement} — {new Date(e.date_echeance).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-1.5 text-right text-xs text-warn-500">{e.jours < 0 ? "échue" : `dans ${e.jours} j`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
