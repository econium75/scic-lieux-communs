"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, Check, Download, FileText, Plus, Receipt, Save, Send, Trash2, X } from "lucide-react";
import { Bouton, champ, champCourt, etiquette } from "@/components/collab/modal";
import { BadgeFacture } from "@/components/badge-facture";
import { blobUrl, telecharger } from "@/lib/collab";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { dateFr, euros, factures, pourcent, type Facture, type IndicateursFacturation, type LigneFacture } from "@/lib/projets";

type Filtre = "a_traiter" | "brouillon" | "emise" | "retard" | "payee" | "toutes";
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function FacturationClient() {
  const router = useRouter();
  const params = useSearchParams();
  const idUrl = params.get("id") ? Number(params.get("id")) : null;
  const [rows, setRows] = useState<Facture[]>([]);
  const [ind, setInd] = useState<IndicateursFacturation | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("a_traiter");
  const [sel, setSel] = useState<Facture | null>(null);
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await factures.liste();
      setRows(r.factures);
      setInd(r.indicateurs);
      return r.factures;
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
      return [];
    }
  }, []);

  useEffect(() => {
    const u = getUser();
    setRole(u?.role ?? null);
    if (u && u.role !== "lecture")
      charger().then((liste) => {
        if (idUrl) {
          const f = liste.find((x) => x.id === idUrl);
          if (f) {
            setSel(f);
            setFiltre("toutes");
          }
        }
      });
  }, [charger, idUrl]);

  const ouvrir = (f: Facture) => {
    setSel(f);
    router.replace(`/facturation?id=${f.id}`, { scroll: false });
  };

  const apres = async (f: Facture | null, texte: string) => {
    setMsg({ ok: true, t: texte });
    const liste = await charger();
    setSel(f ? liste.find((x) => x.id === f.id) || f : null);
    if (f) router.replace(`/facturation?id=${f.id}`, { scroll: false });
  };

  const nouvelle = async () => {
    try {
      const f = await factures.creer({ client_nom: "", objet: "", lignes: [{ designation: "Prestation", quantite: 1, prix_unitaire_ht: 0, taux_tva: 0.2 }] });
      await apres(f, "Brouillon créé : complétez le client et les lignes.");
      setFiltre("brouillon");
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    }
  };

  const visibles = rows.filter((f) =>
    filtre === "toutes" ? true
      : filtre === "a_traiter" ? f.statut === "brouillon" || f.en_retard
      : filtre === "retard" ? f.en_retard
      : f.statut === filtre
  );

  if (role === undefined) return null;
  if (role === null || role === "lecture")
    return <div className="px-6 py-10 text-sm text-ink-700">La facturation est réservée aux profils administrateur et saisie.</div>;
  const admin = role === "admin";

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500 flex items-center gap-2"><Receipt size={11} /> Projets</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Facturation</h1>
          <p className="text-sm text-ink-500 mt-1">Une étape de projet terminée prépare sa facture ; un administrateur la vérifie puis l'émet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Bouton onClick={() => telecharger("/api/factures/export.xlsx", "journal_des_ventes.xlsx").catch((e) => setMsg({ ok: false, t: String(e.message || e) }))}>
            <Download size={13} /> Journal des ventes
          </Bouton>
          {admin && <Link href="/projets/parametrage" className="text-xs px-3 py-1.5 rounded-sm border border-paper-200 bg-white hover:bg-paper-50 inline-flex items-center text-ink-700">Identité et conditions</Link>}
          {admin && <Bouton onClick={nouvelle} variante="primaire"><Plus size={13} /> Facture manuelle</Bouton>}
        </div>
      </div>

      {msg && (
        <div className={cn("mb-4 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      {ind && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Tuile label="À émettre" value={euros(ind.a_emettre_ttc)} sub={`${ind.brouillons} brouillon(s), TTC`} ton={ind.brouillons ? "warn" : undefined} />
          <Tuile label="En attente de paiement" value={euros(ind.en_attente_ttc)} sub="factures émises, TTC" />
          <Tuile label="En retard" value={euros(ind.en_retard_ttc)} sub={`${ind.nb_en_retard} facture(s) échue(s)`} ton={ind.nb_en_retard ? "danger" : undefined} />
          <Tuile label={`Encaissé en ${new Date().getFullYear()}`} value={euros(ind.encaisse_annee_ttc)} sub={`facturé ${euros(ind.facture_annee_ht)} HT`} />
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {([["a_traiter", "À traiter"], ["brouillon", "Brouillons"], ["emise", "Émises"], ["retard", "En retard"], ["payee", "Payées"], ["toutes", "Toutes"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFiltre(k)} className={cn("text-xs px-3 py-1.5 rounded-sm border", filtre === k ? "border-brand-500 text-brand-700 bg-brand-50" : "border-paper-200 text-ink-500 hover:text-ink-900")}>{l}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 rounded-sm border border-paper-200 bg-white overflow-hidden self-start">
          {visibles.length === 0 && <div className="p-8 text-center text-sm text-ink-500">{filtre === "a_traiter" ? "Rien à traiter : aucun brouillon ni retard." : "Aucune facture."}</div>}
          <ul>
            {visibles.map((f) => (
              <li key={f.id}>
                <button onClick={() => ouvrir(f)} className={cn("w-full text-left px-4 py-3 border-b border-paper-200 hover:bg-paper-50", sel?.id === f.id && "bg-brand-50/60")}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{f.numero ? `${f.type === "avoir" ? "Avoir" : "Facture"} ${f.numero}` : f.type === "avoir" ? "Avoir (brouillon)" : "Brouillon"}</span>
                    <span className="ml-auto"><BadgeFacture s={f.statut} retard={f.en_retard} /></span>
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5 flex flex-wrap gap-x-3">
                    <span>{f.client_nom || "Client à préciser"}</span>
                    {f.projet_code && <span>{f.projet_code}</span>}
                    {f.date_echeance && f.statut === "emise" && <span className={cn(f.en_retard && "text-danger-500")}>échéance {dateFr(f.date_echeance)}</span>}
                    <span className="ml-auto tabular-nums text-ink-900">{euros(f.total_ttc, 2)} TTC</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-3">
          {sel ? (
            <Detail key={`${sel.id}-${sel.updated_at}`} f={sel} admin={admin} onFermer={() => { setSel(null); router.replace("/facturation", { scroll: false }); }}
              onAction={apres} onErreur={(t) => setMsg({ ok: false, t })} />
          ) : (
            <div className="hidden lg:flex rounded-sm border border-dashed border-paper-200 p-10 text-sm text-ink-500 items-center justify-center">Sélectionnez une facture.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tuile({ label, value, sub, ton }: { label: string; value: string; sub?: string; ton?: "warn" | "danger" }) {
  return (
    <div className={cn("rounded-sm border bg-white px-4 py-3", ton === "danger" ? "border-danger-500/50" : ton === "warn" ? "border-warn-500/50" : "border-paper-200")}>
      <div className="text-[11px] uppercase tracking-widest text-ink-500">{label}</div>
      <div className={cn("kpi-value text-xl mt-1 tabular-nums", ton === "danger" ? "text-danger-500" : "text-ink-900")}>{value}</div>
      {sub && <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Detail({ f, admin, onFermer, onAction, onErreur }: {
  f: Facture; admin: boolean; onFermer: () => void; onAction: (f: Facture | null, t: string) => void; onErreur: (t: string) => void;
}) {
  const brouillon = f.statut === "brouillon";
  const editable = brouillon && admin;
  const [d, setD] = useState({ client_nom: f.client_nom, client_adresse: f.client_adresse, client_siren: f.client_siren, objet: f.objet, notes: f.notes });
  const [lignes, setLignes] = useState<LigneFacture[]>(f.lignes);
  const [dateEmission, setDateEmission] = useState(aujourdhui());
  const [confirmer, setConfirmer] = useState<null | "emettre" | "payer" | "avoir" | "supprimer">(null);
  const [paiement, setPaiement] = useState({ date: aujourdhui(), mode: "virement" });
  const [busy, setBusy] = useState(false);
  const modifie = JSON.stringify(lignes) !== JSON.stringify(f.lignes) || d.client_nom !== f.client_nom || d.client_adresse !== f.client_adresse
    || d.client_siren !== f.client_siren || d.objet !== f.objet || d.notes !== f.notes;

  const ht = lignes.reduce((a, l) => a + Math.round(l.quantite * l.prix_unitaire_ht * 100) / 100, 0);
  const tva = lignes.reduce((a, l) => a + Math.round(Math.round(l.quantite * l.prix_unitaire_ht * 100) / 100 * l.taux_tva * 100) / 100, 0);

  const agir = async (fn: () => Promise<Facture | null>, texte: (x: Facture | null) => string) => {
    setBusy(true);
    try {
      const x = await fn();
      onAction(x, texte(x));
    } catch (e) {
      onErreur(String((e as Error).message || e));
    } finally {
      setBusy(false);
      setConfirmer(null);
    }
  };
  const enregistrer = () => factures.modifier(f.id, { ...d, lignes });
  const ouvrirPdf = async () => {
    const fen = window.open("", "_blank");
    try {
      const u = await blobUrl(`/api/factures/${f.id}/pdf`);
      if (fen) fen.location.href = u;
      else window.location.href = u;
    } catch (e) {
      fen?.close();
      onErreur(String((e as Error).message || e));
    }
  };
  const majLigne = (i: number, patch: Partial<LigneFacture>) => setLignes(lignes.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="rounded-sm border border-paper-200 bg-white">
      <div className="px-5 py-3 border-b border-paper-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><BadgeFacture s={f.statut} retard={f.en_retard} /></div>
          <h2 className="font-serif text-xl text-ink-900 mt-1">
            {f.numero ? `${f.type === "avoir" ? "Avoir" : "Facture"} ${f.numero}` : f.type === "avoir" ? "Avoir à émettre" : "Facture à émettre"}
          </h2>
          {f.projet_code && <Link href={`/projets/${f.projet_id}`} className="text-xs text-brand-500 hover:underline">{f.projet_code} — {f.projet_nom}</Link>}
          {f.numero_origine && <div className="text-xs text-ink-500">Annule la facture {f.numero_origine}</div>}
          {f.avoir && <div className="text-xs text-ink-500">Avoir {f.avoir.numero || "en préparation"} ({f.avoir.statut === "brouillon" ? "à émettre" : "émis"})</div>}
        </div>
        <button onClick={onFermer} className="p-1 text-ink-500 hover:text-ink-900" aria-label="Fermer"><X size={16} /></button>
      </div>

      <div className="p-5 space-y-4">
        {!brouillon && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Info l="Émise le" v={dateFr(f.date_emission)} />
            {f.type === "facture" && <Info l="Échéance" v={dateFr(f.date_echeance)} rouge={f.en_retard} />}
            {f.date_paiement && <Info l="Payée le" v={`${dateFr(f.date_paiement)}${f.mode_paiement ? ` (${f.mode_paiement})` : ""}`} />}
            <Info l="Total TTC" v={euros(f.total_ttc, 2)} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={etiquette} htmlFor="fa-client">Client</label>
            <input id="fa-client" className={champ} value={d.client_nom} disabled={!editable} onChange={(e) => setD({ ...d, client_nom: e.target.value })} />
          </div>
          <div>
            <label className={etiquette} htmlFor="fa-siren">SIREN du client</label>
            <input id="fa-siren" className={champ} value={d.client_siren} disabled={!editable} onChange={(e) => setD({ ...d, client_siren: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={etiquette} htmlFor="fa-adr">Adresse de facturation</label>
            <textarea id="fa-adr" className={champ} rows={2} value={d.client_adresse} disabled={!editable} onChange={(e) => setD({ ...d, client_adresse: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={etiquette} htmlFor="fa-objet">Objet</label>
            <input id="fa-objet" className={champ} value={d.objet} disabled={!editable} onChange={(e) => setD({ ...d, objet: e.target.value })} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-paper-50">
              <tr>
                {["Désignation", "Qté", "PU HT", "TVA", "Montant HT", ""].map((h, i) => (
                  <th key={i} className={cn("px-2 py-1.5 text-[11px] uppercase tracking-widest text-ink-500 font-medium", i > 0 && i < 5 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i} className="border-t border-paper-200 align-top">
                  <td className="px-2 py-1.5">
                    {editable ? <textarea aria-label="Désignation" className={champ} rows={2} value={l.designation} onChange={(e) => majLigne(i, { designation: e.target.value })} /> : l.designation}
                  </td>
                  <td className="px-2 py-1.5 text-right w-16">
                    {editable ? <ChampNombre label="Quantité" value={l.quantite} onChange={(v) => majLigne(i, { quantite: v })} /> : String(l.quantite).replace(".", ",")}
                  </td>
                  <td className="px-2 py-1.5 text-right w-28 tabular-nums">
                    {editable ? <ChampNombre label="Prix unitaire HT" value={l.prix_unitaire_ht} onChange={(v) => majLigne(i, { prix_unitaire_ht: v })} /> : euros(l.prix_unitaire_ht, 2)}
                  </td>
                  <td className="px-2 py-1.5 text-right w-24">
                    {editable ? (
                      <select aria-label="TVA" className={champ} value={l.taux_tva} onChange={(e) => majLigne(i, { taux_tva: Number(e.target.value) })}>
                        <option value={0.2}>20 %</option><option value={0.1}>10 %</option><option value={0.055}>5,5 %</option><option value={0}>0 %</option>
                      </select>
                    ) : pourcent(l.taux_tva)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums w-28">{euros(Math.round(l.quantite * l.prix_unitaire_ht * 100) / 100, 2)}</td>
                  <td className="px-1 py-1.5 w-8">
                    {editable && lignes.length > 1 && (
                      <button onClick={() => setLignes(lignes.filter((_, j) => j !== i))} className="p-1 text-ink-500 hover:text-danger-500" aria-label="Supprimer la ligne"><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {[["Total HT", ht], ["TVA", tva], ["Total TTC", ht + tva]].map(([l, v], i) => (
                <tr key={l as string} className={cn("border-t border-paper-200", i === 2 && "font-semibold bg-paper-50")}>
                  <td colSpan={4} className="px-2 py-1.5 text-right">{l}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{euros(v as number, 2)}</td>
                  <td />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
        {editable && (
          <Bouton onClick={() => setLignes([...lignes, { designation: "", quantite: 1, prix_unitaire_ht: 0, taux_tva: lignes[0]?.taux_tva ?? 0.2 }])}>
            <Plus size={12} /> Ajouter une ligne
          </Bouton>
        )}

        {confirmer === "emettre" && (
          <div className="rounded-sm border border-brand-500/40 bg-brand-50 px-4 py-3 text-sm space-y-2">
            <p>
              L'émission attribue le prochain numéro de la série, fige le PDF et rend {f.type === "avoir" ? "l'avoir" : "la facture"} définitive :
              elle ne pourra plus être modifiée ni supprimée, seulement annulée par un avoir.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-ink-700" htmlFor="fa-date">Date d'émission</label>
              <input id="fa-date" type="date" className={cn(champCourt, "w-40")} value={dateEmission} max={aujourdhui()} onChange={(e) => setDateEmission(e.target.value)} />
              <span className="ml-auto flex gap-2">
                <Bouton onClick={() => setConfirmer(null)} variante="discret">Annuler</Bouton>
                <Bouton onClick={() => agir(() => factures.emettre(f.id, dateEmission), (x) => `${x?.type === "avoir" ? "Avoir" : "Facture"} ${x?.numero} émis${x?.type === "avoir" ? "" : "e"}.`)} variante="primaire" disabled={busy}>
                  <Send size={12} /> Émettre
                </Bouton>
              </span>
            </div>
          </div>
        )}
        {confirmer === "payer" && (
          <div className="rounded-sm border border-ok-500/40 bg-ok-50 px-4 py-3 text-sm flex flex-wrap items-center gap-2">
            <label className="text-xs text-ink-700" htmlFor="fa-paye">Payée le</label>
            <input id="fa-paye" type="date" className={cn(champCourt, "w-40")} value={paiement.date} max={aujourdhui()} onChange={(e) => setPaiement({ ...paiement, date: e.target.value })} />
            <select aria-label="Mode de paiement" className={cn(champCourt, "w-36")} value={paiement.mode} onChange={(e) => setPaiement({ ...paiement, mode: e.target.value })}>
              <option value="virement">Virement</option><option value="chèque">Chèque</option><option value="prélèvement">Prélèvement</option><option value="autre">Autre</option>
            </select>
            <span className="ml-auto flex gap-2">
              <Bouton onClick={() => setConfirmer(null)} variante="discret">Annuler</Bouton>
              <Bouton onClick={() => agir(() => factures.payer(f.id, paiement.date, paiement.mode), (x) => `Facture ${x?.numero} marquée payée.`)} variante="succes" disabled={busy}><Check size={12} /> Confirmer le paiement</Bouton>
            </span>
          </div>
        )}
        {confirmer === "avoir" && (
          <div className="rounded-sm border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[220px]">Un avoir du même montant est préparé en brouillon ; à son émission, la facture {f.numero} passe en « annulée ».</span>
            <Bouton onClick={() => setConfirmer(null)} variante="discret">Annuler</Bouton>
            <Bouton onClick={() => agir(() => factures.avoir(f.id), () => "Avoir préparé en brouillon : vérifiez-le puis émettez-le.")} variante="danger" disabled={busy}><Ban size={12} /> Préparer l'avoir</Bouton>
          </div>
        )}
        {confirmer === "supprimer" && (
          <div className="rounded-sm border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[220px]">Supprimer ce brouillon ? {f.etape_id ? "L'étape du projet restera terminée, sans facture." : ""}</span>
            <Bouton onClick={() => setConfirmer(null)} variante="discret">Annuler</Bouton>
            <Bouton onClick={() => agir(async () => { await factures.supprimer(f.id); return null; }, () => "Brouillon supprimé.")} variante="danger" disabled={busy}><Trash2 size={12} /> Supprimer</Bouton>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-paper-200">
          <Bouton onClick={ouvrirPdf}><FileText size={12} /> {brouillon ? "Aperçu PDF" : "PDF"}</Bouton>
          {editable && (
            <>
              <Bouton onClick={() => setConfirmer("supprimer")} variante="danger"><Trash2 size={12} /> Supprimer</Bouton>
              <span className="ml-auto flex flex-wrap gap-2">
                <Bouton onClick={() => agir(enregistrer, () => "Brouillon enregistré.")} disabled={!modifie || busy}><Save size={12} /> Enregistrer</Bouton>
                <Bouton onClick={async () => { if (modifie) { try { await enregistrer(); } catch (e) { onErreur(String((e as Error).message || e)); return; } } setConfirmer("emettre"); }} variante="primaire" disabled={busy}>
                  <Send size={12} /> Émettre…
                </Bouton>
              </span>
            </>
          )}
          {admin && f.type === "facture" && f.statut === "emise" && (
            <span className="ml-auto flex flex-wrap gap-2">
              {!f.avoir && <Bouton onClick={() => setConfirmer("avoir")} variante="danger"><Ban size={12} /> Annuler par un avoir</Bouton>}
              <Bouton onClick={() => setConfirmer("payer")} variante="succes"><Check size={12} /> Marquer payée</Bouton>
            </span>
          )}
          {admin && f.type === "facture" && f.statut === "payee" && !f.avoir && (
            <span className="ml-auto"><Bouton onClick={() => setConfirmer("avoir")} variante="danger"><Ban size={12} /> Annuler par un avoir</Bouton></span>
          )}
          {!admin && brouillon && <span className="text-xs text-ink-500 ml-auto">Un administrateur vérifie et émet les factures.</span>}
        </div>
      </div>
    </div>
  );
}

/** Saisie d'un nombre à la française (virgule) : le texte tapé est conservé tant que le champ a le focus. */
function ChampNombre({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const affiche = (v: number) => String(v).replace(".", ",");
  const [t, setT] = useState(affiche(value));
  useEffect(() => {
    if (document.activeElement !== ref.current) setT(affiche(value));
  }, [value]);
  return (
    <input
      ref={ref}
      aria-label={label}
      inputMode="decimal"
      className={cn(champ, "text-right")}
      value={t}
      onChange={(e) => {
        setT(e.target.value);
        const n = Number(e.target.value.replace(/\s/g, "").replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setT(affiche(value))}
    />
  );
}

function Info({ l, v, rouge }: { l: string; v: string; rouge?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-ink-500">{l}</div>
      <div className={cn("text-ink-900", rouge && "text-danger-500 font-medium")}>{v}</div>
    </div>
  );
}
