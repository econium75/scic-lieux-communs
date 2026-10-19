"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Plus, Settings2, X } from "lucide-react";
import { Bouton, Modal, champ, etiquette } from "@/components/collab/modal";
import { collab, type Membre } from "@/lib/collab";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import type { Operation } from "@/lib/types";
import { STATUT_PROJET, euros, projets, type Projet, type StatutProjet } from "@/lib/projets";

type Filtre = "en_cours" | "tous" | StatutProjet;

export function ProjetsClient() {
  const [rows, setRows] = useState<Projet[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>("en_cours");
  const [creer, setCreer] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [role, setRole] = useState<string | null | undefined>(undefined);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setRows(await projets.liste());
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    const u = getUser();
    setRole(u?.role ?? null);
    if (u) charger();
  }, [charger]);

  const visibles = rows.filter((p) => filtre === "tous" || p.statut === filtre);
  const encours = rows.filter((p) => p.statut === "en_cours");
  const totaux = useMemo(
    () => ({
      honoraires: encours.reduce((a, p) => a + p.montant_ht, 0),
      facture: rows.reduce((a, p) => a + p.facture_ht, 0),
      reste: encours.reduce((a, p) => a + p.reste_a_facturer_ht, 0),
      brouillons: rows.reduce((a, p) => a + p.nb_brouillons, 0),
    }),
    [rows, encours]
  );
  const peutSaisir = role === "admin" || role === "saisie";

  if (role === null)
    return (
      <div className="px-6 py-10 text-sm text-ink-700">
        <Link href="/login" className="text-brand-500 hover:underline">Connectez-vous</Link> pour voir les projets.
      </div>
    );

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <Briefcase size={11} /> Projets
          </div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Suivi des projets</h1>
          <p className="text-sm text-ink-500 mt-1">
            Chaque projet suit un parcours d'étapes ; une étape terminée prépare sa facture, et les contrats se génèrent depuis les modèles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {role === "admin" && (
            <Link href="/projets/parametrage" className="text-xs px-3 py-1.5 rounded-sm border border-paper-200 bg-white hover:bg-paper-50 inline-flex items-center gap-1.5 text-ink-700">
              <Settings2 size={13} /> Parcours et modèles
            </Link>
          )}
          {peutSaisir && (
            <Bouton onClick={() => setCreer(true)} variante="primaire">
              <Plus size={13} /> Nouveau projet
            </Bouton>
          )}
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-sm border border-danger-500/40 bg-danger-50 px-4 py-2 text-sm flex items-center justify-between gap-3">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Tuile label="Projets en cours" value={String(encours.length)} sub={`${rows.length} au total`} />
        <Tuile label="Honoraires des projets en cours" value={euros(totaux.honoraires)} sub="hors taxes" />
        <Tuile label="Déjà facturé" value={euros(totaux.facture)} sub="factures émises, hors taxes" />
        <Tuile label="Reste à facturer" value={euros(totaux.reste)} sub={totaux.brouillons ? `${totaux.brouillons} facture(s) à émettre` : "projets en cours"} accent={totaux.brouillons > 0} />
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {([["en_cours", "En cours"], ["termine", "Terminés"], ["suspendu", "Suspendus"], ["abandonne", "Abandonnés"], ["tous", "Tous"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFiltre(k)} className={cn("text-xs px-3 py-1.5 rounded-sm border", filtre === k ? "border-brand-500 text-brand-700 bg-brand-50" : "border-paper-200 text-ink-500 hover:text-ink-900")}>
            {l}
          </button>
        ))}
      </div>

      <div className="rounded-sm border border-paper-200 bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-paper-50">
            <tr className="text-left">
              {["Projet", "Client", "Responsable", "Étape en cours", "Avancement", "Honoraires HT", "Facturé HT"].map((h, i) => (
                <th key={h} className={cn("px-4 py-2 text-[11px] uppercase tracking-widest text-ink-500 font-medium", i >= 5 && "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chargement && <tr><td colSpan={7} className="px-4 py-6 text-ink-500 italic">Chargement…</td></tr>}
            {!chargement && visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-500">
                  {rows.length === 0 ? "Aucun projet pour l'instant." : "Aucun projet dans cette catégorie."}
                  {rows.length === 0 && peutSaisir && (
                    <button onClick={() => setCreer(true)} className="ml-2 text-brand-500 hover:underline">Créer le premier projet</button>
                  )}
                </td>
              </tr>
            )}
            {visibles.map((p) => (
              <tr key={p.id} className="border-t border-paper-200 hover:bg-paper-50">
                <td className="px-4 py-3">
                  <Link href={`/projets/${p.id}`} className="font-medium text-ink-900 hover:text-brand-500">{p.nom}</Link>
                  <div className="text-[11px] text-ink-500">
                    {p.code}
                    {p.operation_nom && <> · {p.operation_nom}</>}
                    {p.statut !== "en_cours" && <> · {STATUT_PROJET[p.statut]}</>}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-700">{p.client_nom || <span className="text-ink-300">—</span>}</td>
                <td className="px-4 py-3 text-ink-700">{p.responsable_nom}</td>
                <td className="px-4 py-3 text-ink-700">{p.etape_en_cours || (p.nb_etapes && p.nb_etapes === p.nb_etapes_terminees ? "Toutes terminées" : "—")}</td>
                <td className="px-4 py-3 w-44">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-paper-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, p.avancement)}%` }} />
                    </div>
                    <span className="text-[11px] text-ink-500 tabular-nums w-16 text-right">{p.nb_etapes_terminees}/{p.nb_etapes} étapes</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{euros(p.montant_ht)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {euros(p.facture_ht)}
                  {p.nb_brouillons > 0 && <div className="text-[11px] text-warn-500">{p.nb_brouillons} à émettre</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creer && <NouveauProjet onClose={() => setCreer(false)} />}
    </div>
  );
}

function Tuile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-sm border bg-white px-4 py-3", accent ? "border-warn-500/50" : "border-paper-200")}>
      <div className="text-[11px] uppercase tracking-widest text-ink-500">{label}</div>
      <div className="kpi-value text-xl text-ink-900 mt-1 tabular-nums">{value}</div>
      {sub && <div className={cn("text-[11px] mt-0.5", accent ? "text-warn-500 font-medium" : "text-ink-500")}>{sub}</div>}
    </div>
  );
}

export function NouveauProjet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ nom: "", client_nom: "", client_adresse: "", client_siren: "", client_contact: "", client_email: "",
    operation_id: "", responsable: getUser()?.username || "", montant_ht: "", taux_tva: "0.2" });
  const [membres, setMembres] = useState<Membre[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    collab.annuaire().then(setMembres).catch(() => {});
    api.listOperations().then(setOperations).catch(() => {});
  }, []);

  const valider = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await projets.creer({
        nom: f.nom, client_nom: f.client_nom, client_adresse: f.client_adresse, client_siren: f.client_siren,
        client_contact: f.client_contact, client_email: f.client_email, responsable: f.responsable,
        operation_id: f.operation_id ? Number(f.operation_id) : null,
        montant_ht: Number(String(f.montant_ht).replace(/\s/g, "").replace(",", ".")) || 0, taux_tva: Number(f.taux_tva),
      });
      router.push(`/projets/${p.id}`);
    } catch (e) {
      setErr(String((e as Error).message || e));
      setBusy(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal
      titre="Nouveau projet"
      onClose={onClose}
      large
      pied={
        <>
          <Bouton onClick={onClose} variante="discret">Annuler</Bouton>
          <Bouton onClick={valider} variante="primaire" disabled={busy || !f.nom.trim()}>{busy ? "Création…" : "Créer le projet"}</Bouton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={etiquette} htmlFor="np-nom">Nom du projet</label>
          <input id="np-nom" className={champ} value={f.nom} onChange={set("nom")} placeholder="ex. Habitat participatif Les Tilleuls" autoFocus />
        </div>
        <div>
          <label className={etiquette} htmlFor="np-client">Client ou bénéficiaire</label>
          <input id="np-client" className={champ} value={f.client_nom} onChange={set("client_nom")} />
        </div>
        <div>
          <label className={etiquette} htmlFor="np-siren">SIREN du client</label>
          <input id="np-siren" className={champ} value={f.client_siren} onChange={set("client_siren")} placeholder="9 chiffres" />
        </div>
        <div className="sm:col-span-2">
          <label className={etiquette} htmlFor="np-adresse">Adresse du client</label>
          <textarea id="np-adresse" className={champ} rows={2} value={f.client_adresse} onChange={set("client_adresse")} />
        </div>
        <div>
          <label className={etiquette} htmlFor="np-contact">Signataire (nom, fonction)</label>
          <input id="np-contact" className={champ} value={f.client_contact} onChange={set("client_contact")} />
        </div>
        <div>
          <label className={etiquette} htmlFor="np-email">E-mail du client</label>
          <input id="np-email" className={champ} type="email" value={f.client_email} onChange={set("client_email")} />
        </div>
        <div>
          <label className={etiquette} htmlFor="np-montant">Honoraires HT (€)</label>
          <input id="np-montant" className={champ} inputMode="decimal" value={f.montant_ht} onChange={set("montant_ht")} placeholder="0" />
        </div>
        <div>
          <label className={etiquette} htmlFor="np-tva">TVA</label>
          <select id="np-tva" className={champ} value={f.taux_tva} onChange={set("taux_tva")}>
            <option value="0.2">20 %</option>
            <option value="0.1">10 %</option>
            <option value="0.055">5,5 %</option>
            <option value="0">Non applicable (0 %)</option>
          </select>
        </div>
        <div>
          <label className={etiquette} htmlFor="np-resp">Responsable</label>
          <select id="np-resp" className={champ} value={f.responsable} onChange={set("responsable")}>
            {membres.map((m) => <option key={m.username} value={m.username}>{m.nom_affichage}</option>)}
          </select>
        </div>
        <div>
          <label className={etiquette} htmlFor="np-op">Opération liée (facultatif)</label>
          <select id="np-op" className={champ} value={f.operation_id} onChange={set("operation_id")}>
            <option value="">— aucune —</option>
            {operations.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-ink-500 mt-4">Le projet reprend le parcours type des étapes ; vous pourrez l'adapter ensuite.</p>
      {err && <div className="mt-3 text-sm text-danger-500">{err}</div>}
    </Modal>
  );
}
