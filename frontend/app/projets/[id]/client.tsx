"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Check, FilePlus2, FileSignature, FileText, HandCoins, Pencil, Play, Plus, Receipt, RotateCcw, Trash2, X } from "lucide-react";
import { Bouton, Modal, champ, champCourt, etiquette } from "@/components/collab/modal";
import { BadgeFacture } from "@/components/badge-facture";
import { EditeurRegle } from "@/components/regle-facturation";
import { collab, type Membre } from "@/lib/collab";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import type { Operation } from "@/lib/types";
import {
  PAYEURS, REGLE_VIDE, STATUT_ETAPE, STATUT_PROJET, dateFr, euros, pourcent, projets,
  type Etape, type Modele, type Partie, type ProjetDetail, type RegleFacturation, type StatutProjet,
} from "@/lib/projets";

export function ProjetDetailClient({ id }: { id: number }) {
  const router = useRouter();
  const [p, setP] = useState<ProjetDetail | null>(null);
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "infos" | "etapes" | { generer: string | null; modele?: number }>(null);

  const charger = useCallback(async () => {
    try {
      const [x, m] = await Promise.all([projets.lire(id), projets.modeles()]);
      setP(x);
      setModeles(m.modeles.filter((y) => y.actif));
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    }
  }, [id]);

  useEffect(() => {
    setRole(getUser()?.role ?? null);
    charger();
  }, [charger]);

  const peutSaisir = role === "admin" || role === "saisie";

  const statut = async (e: Etape, s: Etape["statut"]) => {
    setBusy(e.id);
    setConfirmer(null);
    try {
      const x = await projets.statutEtape(id, e.id, s);
      setP(x);
      const f = x.etapes.find((y) => y.id === e.id)?.facture;
      setMsg({
        ok: true,
        t: s === "terminee"
          ? f && f.statut === "brouillon"
            ? `Étape terminée : la facture de ${euros(f.total_ttc, 2)} TTC à ${e.payeur_nom || PAYEURS[e.facturation.payeur].toLowerCase()} est prête à être émise.`
            : e.facturation.nature === "financement" && e.facturation.mode !== "aucune"
              ? `Étape terminée : financement de ${euros(e.montant_ht)} noté comme acquis.`
              : "Étape terminée."
          : `Étape « ${e.nom} » : ${STATUT_ETAPE[s].toLowerCase()}.`,
      });
    } catch (err) {
      setMsg({ ok: false, t: String((err as Error).message || err) });
    } finally {
      setBusy(null);
    }
  };

  const supprimer = async () => {
    if (!p) return;
    try {
      await projets.supprimer(p.id);
      router.push("/projets");
    } catch (err) {
      setMsg({ ok: false, t: String((err as Error).message || err) });
    }
  };

  if (!p)
    return <div className="px-6 py-10 text-sm text-ink-500">{msg ? msg.t : "Chargement…"}</div>;

  const ttc = p.montant_ht * (1 + p.taux_tva);
  const nomModele = (mid: number) => modeles.find((m) => m.id === mid)?.titre || "Modèle";
  const phases = Array.from(new Set(p.etapes.map((e) => e.phase || "")));
  const surHonoraires = p.etapes.some((e) => e.facturation.mode === "pourcentage" && e.facturation.base === "honoraires");

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-6xl">
      <Link href="/projets" className="text-[11px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><ArrowLeft size={11} /> Suivi des projets</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-1 mb-5">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-ink-500">Projet · {p.code}</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">{p.nom}</h1>
          <p className="text-sm text-ink-500 mt-1">
            {p.client_nom || "Client à préciser"} · responsable {p.responsable_nom}
            {p.operation_id && p.operation_nom && (
              <> · opération <Link href={`/operations/${p.operation_id}`} className="text-brand-500 hover:underline">{p.operation_nom}</Link></>
            )}
            <span className={cn("ml-2 text-[11px] px-1.5 py-0.5 rounded-sm border", p.statut === "en_cours" ? "border-brand-500/40 text-brand-700 bg-brand-50" : "border-paper-200 text-ink-500")}>
              {STATUT_PROJET[p.statut]}
            </span>
          </p>
        </div>
        {peutSaisir && (
          <div className="flex flex-wrap gap-2">
            <Bouton onClick={() => setModal({ generer: null })}><FilePlus2 size={13} /> Générer un document</Bouton>
            <Bouton onClick={() => setModal("infos")}><Pencil size={13} /> Modifier</Bouton>
          </div>
        )}
      </div>

      {msg && (
        <div className={cn("mb-4 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>
            {msg.t}
            {msg.ok && msg.t.includes("prête à être émise") && role === "admin" && (
              <Link href="/facturation" className="ml-2 text-brand-500 hover:underline">Ouvrir la facturation →</Link>
            )}
          </span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Tuile label="Honoraires" value={euros(p.montant_ht)}
          sub={p.ca_previsionnel_ttc > 0 ? `HT · ${pourcent(p.taux_honoraires)} de ${euros(p.ca_previsionnel_ttc)} TTC` : `HT · ${euros(ttc)} TTC`} />
        <Tuile label="Avancement" value={`${p.avancement} %`} sub={`${p.nb_etapes_terminees} étape(s) sur ${p.nb_etapes}`} barre={p.avancement} />
        <Tuile label="Facturé" value={euros(p.facture_ht)} sub={`HT · payé ${euros(p.paye_ttc)} TTC`} />
        <Tuile label="Reste à facturer" value={euros(p.reste_a_facturer_ht)} sub={`HT, sur ${euros(p.total_facturable_ht)} prévus au parcours`} />
      </div>

      <section className="rounded-sm border border-paper-200 bg-white mb-6">
        <div className="px-5 py-3 border-b border-paper-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">Parcours du projet</div>
            {surHonoraires && p.montant_ht === 0 && (
              <div className="text-xs text-warn-500 mt-0.5">Saisissez le chiffre d'affaires prévisionnel TTC (« Modifier ») pour calculer les honoraires.</div>
            )}
            {p.montant_ht > 0 && p.part_honoraires_planifiee < 0.9999 && (
              <div className="text-xs text-warn-500 mt-0.5">
                Le contrat d'honoraires n'est échelonné qu'à {pourcent(p.part_honoraires_planifiee)} : précisez à quelles étapes facturer
                les {pourcent(1 - p.part_honoraires_planifiee)} restants ({euros(p.montant_ht * (1 - p.part_honoraires_planifiee))} HT).
              </div>
            )}
          </div>
          {peutSaisir && <Bouton onClick={() => setModal("etapes")} variante="discret"><Pencil size={12} /> Modifier les étapes</Bouton>}
        </div>
        <ol>
          {p.etapes.map((e, i) => {
            const docs = p.documents.filter((d) => d.etape_id === e.id);
            const debutPhase = !!e.phase && (i === 0 || p.etapes[i - 1].phase !== e.phase);
            const dansPhase = p.etapes.filter((x) => x.phase === e.phase);
            const r = e.facturation;
            const verrouillee = !!e.facture && e.facture.statut !== "brouillon";
            return (
              <li key={e.id}>
              {debutPhase && (
                <div className="px-5 py-2 bg-paper-50 border-t border-paper-200 flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-widest text-ink-700 font-medium">Phase {phases.indexOf(e.phase) + 1} · {e.phase}</span>
                  <span className="text-[11px] text-ink-500 tabular-nums">{dansPhase.filter((x) => x.statut === "terminee").length}/{dansPhase.length} étapes</span>
                </div>
              )}
              <div className="px-5 py-4 border-t border-paper-200 flex gap-4">
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                  e.statut === "terminee" ? "bg-ok-500 text-white" : e.statut === "en_cours" ? "bg-brand-500 text-white" : "bg-paper-100 text-ink-500 border border-paper-200")}>
                  {e.statut === "terminee" ? <Check size={14} /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-ink-900">{e.nom}</span>
                    <span className={cn("text-[11px] font-medium", e.statut === "terminee" ? "text-ok-500" : e.statut === "en_cours" ? "text-brand-500" : "text-ink-500")}>
                      {STATUT_ETAPE[e.statut]}{e.date_realisation ? ` le ${dateFr(e.date_realisation)}` : e.date_prevue ? ` · prévue le ${dateFr(e.date_prevue)}` : ""}
                    </span>
                  </div>
                  {e.description && <p className="text-xs text-ink-500 mt-0.5">{e.description}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
                    {r.mode !== "aucune" && (
                      <span className={cn("tabular-nums inline-flex items-center gap-1", r.nature === "financement" ? "text-ok-500" : "text-ink-700")}>
                        {r.nature === "financement" ? <HandCoins size={12} /> : <Receipt size={12} className="text-ink-500" />}
                        {r.nature === "financement" ? "Financement" : "Facturation"} : {e.regle_libelle.replace(" · financement", "")} · {euros(e.montant_ht)}{r.nature === "facture" ? " HT" : ""}
                        <span className="text-ink-500"> · {e.payeur_nom || PAYEURS[r.payeur]}</span>
                      </span>
                    )}
                    {e.facture && (
                      <Link href={`/facturation?id=${e.facture.id}`} className="inline-flex items-center gap-1 text-brand-500 hover:underline">
                        <Receipt size={12} /> {e.facture.numero ? `Facture ${e.facture.numero}` : "Facture à émettre"} · <BadgeFacture s={e.facture.statut} />
                      </Link>
                    )}
                    {docs.map((d) => (
                      <Link key={d.document_id} href={`/documents/${d.document_id}`} className="inline-flex items-center gap-1 text-ink-700 hover:text-brand-500">
                        <FileText size={12} /> {d.titre.split(" — ")[0]}{d.statut === "signe" && <span className="text-ok-500 font-medium"> · signé</span>}
                      </Link>
                    ))}
                  </div>
                  {peutSaisir && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {e.modeles.map((mid) => (
                        <Bouton key={mid} onClick={() => setModal({ generer: e.id, modele: mid })} variante="secondaire" title="Générer depuis le modèle prévu pour cette étape">
                          <FilePlus2 size={12} /> {nomModele(mid)}
                        </Bouton>
                      ))}
                      {e.statut === "a_venir" && <Bouton onClick={() => statut(e, "en_cours")} disabled={busy === e.id}><Play size={12} /> Démarrer</Bouton>}
                      {e.statut !== "terminee" && confirmer !== e.id && (
                        <Bouton onClick={() => setConfirmer(e.id)} variante="succes" disabled={busy === e.id}><Check size={12} /> Marquer terminée</Bouton>
                      )}
                      {confirmer === e.id && (
                        <div className="w-full rounded-sm border border-ok-500/40 bg-ok-50 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                          <span className="flex-1 min-w-[200px]">
                            {e.montant_ht > 0 && !e.facture && r.nature === "facture"
                              ? `Terminer l'étape prépare une facture de ${euros(e.montant_ht, 2)} HT adressée à ${e.payeur_nom || PAYEURS[r.payeur].toLowerCase()}, à émettre par un administrateur.`
                              : e.montant_ht > 0 && r.nature === "financement"
                                ? `Le financement de ${euros(e.montant_ht)} (${e.payeur_nom || "financeur"}) sera noté comme acquis.`
                                : "Confirmer la fin de l'étape ?"}
                          </span>
                          <Bouton onClick={() => setConfirmer(null)} variante="discret">Annuler</Bouton>
                          <Bouton onClick={() => statut(e, "terminee")} variante="succes">Confirmer</Bouton>
                        </div>
                      )}
                      {e.statut === "terminee" && !verrouillee && (
                        <Bouton onClick={() => statut(e, "en_cours")} variante="discret" disabled={busy === e.id}
                          title={e.facture ? "La facture en brouillon sera supprimée" : undefined}>
                          <RotateCcw size={12} /> Rouvrir
                        </Bouton>
                      )}
                    </div>
                  )}
                </div>
              </div>
              </li>
            );
          })}
          {p.etapes.length === 0 && <li className="px-5 py-6 text-sm text-ink-500">Aucune étape : ajoutez-en avec « Modifier les étapes ».</li>}
        </ol>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <section className="rounded-sm border border-paper-200 bg-white">
          <div className="px-5 py-3 border-b border-paper-200 text-[11px] uppercase tracking-widest text-ink-500 font-medium">Parties au projet</div>
          <dl className="px-5 py-3 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-500">Client</dt><dd className="text-ink-900">{p.client_nom || "—"}{p.client_contact && <span className="text-ink-500"> · {p.client_contact}</span>}</dd>
            {(["collectivite", "promoteur", "financeur"] as const).map((k) => (
              <Fragment key={k}>
                <dt className="text-ink-500">{PAYEURS[k]}</dt>
                <dd className={p.tiers[k].nom ? "text-ink-900" : "text-ink-300"}>{p.tiers[k].nom || "à préciser"}{p.tiers[k].contact && <span className="text-ink-500"> · {p.tiers[k].contact}</span>}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
        <section className="rounded-sm border border-paper-200 bg-white">
          <div className="px-5 py-3 border-b border-paper-200 text-[11px] uppercase tracking-widest text-ink-500 font-medium">Financements</div>
          {p.financements.length === 0 ? (
            <div className="px-5 py-5 text-sm text-ink-500">Aucun financement prévu au parcours.</div>
          ) : (
            <ul>
              {p.financements.map((x) => (
                <li key={x.etape_id} className="px-5 py-3 border-t border-paper-200 first:border-t-0 flex items-center gap-3 text-sm">
                  <HandCoins size={15} className={x.obtenu ? "text-ok-500" : "text-ink-500"} />
                  <div className="flex-1 min-w-0"><div className="text-ink-900 truncate">{x.nom}</div><div className="text-[11px] text-ink-500">{x.financeur || "Financeur à préciser"}</div></div>
                  <span className={cn("text-[11px] font-medium", x.obtenu ? "text-ok-500" : "text-ink-500")}>{x.obtenu ? "Acquis" : "Attendu"}</span>
                  <span className="tabular-nums text-ink-900 w-24 text-right">{euros(x.montant)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-sm border border-paper-200 bg-white">
          <div className="px-5 py-3 border-b border-paper-200 text-[11px] uppercase tracking-widest text-ink-500 font-medium">Contrats et conventions</div>
          {p.documents.length === 0 ? (
            <div className="px-5 py-5 text-sm text-ink-500">
              Aucun document généré.{peutSaisir && <button onClick={() => setModal({ generer: null })} className="ml-1 text-brand-500 hover:underline">Générer depuis un modèle</button>}
            </div>
          ) : (
            <ul>
              {[...p.documents].reverse().map((d) => (
                <li key={d.document_id} className="px-5 py-3 border-t border-paper-200 first:border-t-0 flex items-center gap-3">
                  <FileText size={15} className="text-ink-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Link href={`/documents/${d.document_id}`} className="text-sm text-ink-900 hover:text-brand-500 truncate block">{d.titre}</Link>
                    <div className="text-[11px] text-ink-500">généré par {d.par_nom} le {dateFr(d.at)}</div>
                  </div>
                  {d.statut === "signe" ? (
                    <span className="text-[11px] text-ok-500 font-medium inline-flex items-center gap-1"><FileSignature size={12} /> Signé</span>
                  ) : (
                    <Link href={`/documents/${d.document_id}`} className="text-[11px] text-brand-500 hover:underline whitespace-nowrap">Envoyer pour signature →</Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-paper-200 bg-white">
          <div className="px-5 py-3 border-b border-paper-200 text-[11px] uppercase tracking-widest text-ink-500 font-medium">Factures du projet</div>
          {p.factures.length === 0 ? (
            <div className="px-5 py-5 text-sm text-ink-500">Aucune facture : elles sont préparées à la fin de chaque étape.</div>
          ) : (
            <ul>
              {p.factures.map((f) => (
                <li key={f.id} className="px-5 py-3 border-t border-paper-200 first:border-t-0 flex items-center gap-3 text-sm">
                  <Link href={`/facturation?id=${f.id}`} className="flex-1 min-w-0 hover:text-brand-500">
                    <div className="text-ink-900 truncate">{f.numero ? `${f.type === "avoir" ? "Avoir" : "Facture"} ${f.numero}` : "Brouillon"}</div>
                    <div className="text-[11px] text-ink-500 truncate">{f.objet}</div>
                  </Link>
                  <BadgeFacture s={f.statut} />
                  <span className="tabular-nums text-ink-900 w-28 text-right">{euros(f.total_ttc, 2)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {p.notes && <p className="text-sm text-ink-700 mt-5 whitespace-pre-line"><span className="text-ink-500">Notes : </span>{p.notes}</p>}

      {role === "admin" && (
        <div className="mt-8 text-right">
          <Bouton onClick={supprimer} variante="danger" title="Possible tant qu'aucune facture n'est émise"><Trash2 size={12} /> Supprimer le projet</Bouton>
        </div>
      )}

      {modal === "infos" && <ModifierProjet p={p} onClose={() => setModal(null)} onSave={(x) => { setP(x); setModal(null); setMsg({ ok: true, t: "Projet enregistré." }); }} />}
      {modal === "etapes" && <ModifierEtapes p={p} modeles={modeles} onClose={() => setModal(null)} onSave={(x) => { setP(x); setModal(null); setMsg({ ok: true, t: "Étapes enregistrées." }); }} />}
      {modal && typeof modal === "object" && (
        <GenererDocument p={p} modeles={modeles} etapeId={modal.generer} modeleInitial={modal.modele} onClose={() => setModal(null)}
          onFait={(x, docId) => { setP(x); setModal(null); setMsg({ ok: true, t: "Document généré et rangé dans votre porte-documents (dossier « Projets »)." }); router.prefetch(`/documents/${docId}`); }} />
      )}
    </div>
  );
}

function Tuile({ label, value, sub, barre }: { label: string; value: string; sub?: string; barre?: number }) {
  return (
    <div className="rounded-sm border border-paper-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-widest text-ink-500">{label}</div>
      <div className="kpi-value text-xl text-ink-900 mt-1 tabular-nums">{value}</div>
      {barre !== undefined && (
        <div className="h-1.5 bg-paper-100 rounded-full overflow-hidden mt-1.5">
          <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, barre)}%` }} />
        </div>
      )}
      {sub && <div className="text-[11px] text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}

function ModifierProjet({ p, onClose, onSave }: { p: ProjetDetail; onClose: () => void; onSave: (x: ProjetDetail) => void }) {
  const [f, setF] = useState({
    nom: p.nom, client_nom: p.client_nom, client_adresse: p.client_adresse, client_siren: p.client_siren, client_contact: p.client_contact,
    client_email: p.client_email, operation_id: p.operation_id ? String(p.operation_id) : "", responsable: p.responsable,
    montant_ht: String(p.montant_ht), taux_tva: String(p.taux_tva), statut: p.statut, notes: p.notes,
    ca: p.ca_previsionnel_ttc ? String(p.ca_previsionnel_ttc) : "", taux_honoraires: String(Math.round(p.taux_honoraires * 10000) / 100).replace(".", ","),
  });
  const [tiers, setTiers] = useState<ProjetDetail["tiers"]>(structuredClone(p.tiers));
  const [membres, setMembres] = useState<Membre[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    collab.annuaire().then(setMembres).catch(() => {});
    api.listOperations().then(setOperations).catch(() => {});
  }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const valider = async () => {
    try {
      onSave(await projets.modifier(p.id, {
        nom: f.nom, client_nom: f.client_nom, client_adresse: f.client_adresse, client_siren: f.client_siren, client_contact: f.client_contact,
        client_email: f.client_email, operation_id: f.operation_id ? Number(f.operation_id) : null, responsable: f.responsable,
        montant_ht: nombre(f.montant_ht), taux_tva: Number(f.taux_tva), statut: f.statut as StatutProjet, notes: f.notes,
        ca_previsionnel_ttc: nombre(f.ca), taux_honoraires: nombre(f.taux_honoraires) / 100, tiers,
      }));
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  };
  return (
    <Modal titre="Modifier le projet" onClose={onClose} large pied={<><Bouton onClick={onClose} variante="discret">Annuler</Bouton><Bouton onClick={valider} variante="primaire">Enregistrer</Bouton></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><label className={etiquette} htmlFor="mp-nom">Nom du projet</label><input id="mp-nom" className={champ} value={f.nom} onChange={set("nom")} /></div>
        <div><label className={etiquette} htmlFor="mp-client">Client ou bénéficiaire</label><input id="mp-client" className={champ} value={f.client_nom} onChange={set("client_nom")} /></div>
        <div><label className={etiquette} htmlFor="mp-siren">SIREN du client</label><input id="mp-siren" className={champ} value={f.client_siren} onChange={set("client_siren")} /></div>
        <div className="sm:col-span-2"><label className={etiquette} htmlFor="mp-adr">Adresse du client</label><textarea id="mp-adr" className={champ} rows={2} value={f.client_adresse} onChange={set("client_adresse")} /></div>
        <div><label className={etiquette} htmlFor="mp-contact">Signataire (nom, fonction)</label><input id="mp-contact" className={champ} value={f.client_contact} onChange={set("client_contact")} /></div>
        <div><label className={etiquette} htmlFor="mp-email">E-mail du client</label><input id="mp-email" className={champ} value={f.client_email} onChange={set("client_email")} /></div>
        <div><label className={etiquette} htmlFor="mp-ca">Chiffre d'affaires prévisionnel TTC (€)</label><input id="mp-ca" className={champ} inputMode="decimal" value={f.ca} onChange={set("ca")} placeholder="prix de vente total" /></div>
        <div><label className={etiquette} htmlFor="mp-taux">Contrat d'honoraires (% du prix de vente TTC)</label><input id="mp-taux" className={champ} inputMode="decimal" value={f.taux_honoraires} onChange={set("taux_honoraires")} /></div>
        <div>
          <label className={etiquette} htmlFor="mp-ht">Honoraires HT (€)</label>
          {nombre(f.ca) > 0
            ? <div id="mp-ht" className="text-sm text-ink-900 py-1.5 tabular-nums">{euros(nombre(f.ca) * nombre(f.taux_honoraires) / 100)} <span className="text-ink-500 text-xs">calculés depuis le CA</span></div>
            : <input id="mp-ht" className={champ} inputMode="decimal" value={f.montant_ht} onChange={set("montant_ht")} />}
        </div>
        <div>
          <label className={etiquette} htmlFor="mp-tva">TVA</label>
          <select id="mp-tva" className={champ} value={f.taux_tva} onChange={set("taux_tva")}>
            <option value="0.2">20 %</option><option value="0.1">10 %</option><option value="0.055">5,5 %</option><option value="0">Non applicable (0 %)</option>
          </select>
        </div>
        <div>
          <label className={etiquette} htmlFor="mp-resp">Responsable</label>
          <select id="mp-resp" className={champ} value={f.responsable} onChange={set("responsable")}>
            {membres.map((m) => <option key={m.username} value={m.username}>{m.nom_affichage}</option>)}
          </select>
        </div>
        <div>
          <label className={etiquette} htmlFor="mp-op">Opération liée</label>
          <select id="mp-op" className={champ} value={f.operation_id} onChange={set("operation_id")}>
            <option value="">— aucune —</option>
            {operations.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </div>
        <div>
          <label className={etiquette} htmlFor="mp-statut">Statut</label>
          <select id="mp-statut" className={champ} value={f.statut} onChange={set("statut")}>
            {Object.entries(STATUT_PROJET).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label className={etiquette} htmlFor="mp-notes">Notes</label><textarea id="mp-notes" className={champ} rows={3} value={f.notes} onChange={set("notes")} /></div>
      </div>
      {(["collectivite", "promoteur", "financeur"] as const).map((k) => (
        <fieldset key={k} className="mt-5 border-t border-paper-200 pt-3">
          <legend className="text-[11px] uppercase tracking-widest text-ink-500 font-medium pr-2">{PAYEURS[k]}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            {([["nom", "Nom"], ["contact", "Signataire (nom, fonction)"], ["adresse", "Adresse"], ["siren", "SIREN"]] as [keyof Partie, string][]).map(([c, l]) => (
              <div key={c}>
                <label className={etiquette} htmlFor={`mp-${k}-${c}`}>{l}</label>
                <input id={`mp-${k}-${c}`} className={champ} value={tiers[k][c]} onChange={(e) => setTiers({ ...tiers, [k]: { ...tiers[k], [c]: e.target.value } })} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      {err && <div className="mt-3 text-sm text-danger-500">{err}</div>}
    </Modal>
  );
}

type EtapeEdit = { id?: string; phase: string; nom: string; description: string; facturation: RegleFacturation; date_prevue: string; modeles: number[]; statut?: Etape["statut"]; verrouillee: boolean };

const nombre = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;

function ModifierEtapes({ p, modeles, onClose, onSave }: { p: ProjetDetail; modeles: Modele[]; onClose: () => void; onSave: (x: ProjetDetail) => void }) {
  const [rows, setRows] = useState<EtapeEdit[]>(
    p.etapes.map((e) => ({ id: e.id, phase: e.phase, nom: e.nom, description: e.description, facturation: e.facturation,
      date_prevue: e.date_prevue || "", modeles: e.modeles, statut: e.statut, verrouillee: !!e.facture && e.facture.statut !== "brouillon" }))
  );
  const [err, setErr] = useState<string | null>(null);
  const total = rows.reduce((a, r) => a + (r.facturation.mode === "pourcentage" && r.facturation.base === "honoraires" && r.facturation.nature === "facture" ? r.facturation.taux : 0), 0) * 100;
  const phases = Array.from(new Set(rows.map((r) => r.phase).filter(Boolean)));
  const maj = (i: number, patch: Partial<EtapeEdit>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const deplacer = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const x = [...rows];
    [x[i], x[j]] = [x[j], x[i]];
    setRows(x);
  };
  const valider = async () => {
    try {
      onSave(await projets.modifier(p.id, {
        etapes: rows.map((r) => ({ id: r.id, phase: r.phase, nom: r.nom, description: r.description, facturation: r.facturation, date_prevue: r.date_prevue || null,
          modeles: r.modeles, statut: r.statut })),
      }));
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  };
  return (
    <Modal titre="Étapes du projet" onClose={onClose} large
      pied={<>
        <span className={cn("mr-auto text-xs tabular-nums", Math.abs(total - 100) > 0.01 ? "text-warn-500" : "text-ok-500")}>Honoraires échelonnés : {String(Math.round(total * 100) / 100).replace(".", ",")} %</span>
        <Bouton onClick={onClose} variante="discret">Annuler</Bouton><Bouton onClick={valider} variante="primaire">Enregistrer</Bouton>
      </>}>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.id || `n${i}`} className="rounded-sm border border-paper-200 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-500 w-5">{i + 1}.</span>
              <input aria-label="Nom de l'étape" className={cn(champ, "flex-1 min-w-0")} value={r.nom} onChange={(e) => maj(i, { nom: e.target.value })} />
              <button onClick={() => deplacer(i, -1)} className="p-1 text-ink-500 hover:text-ink-900" aria-label="Monter"><ArrowUp size={14} /></button>
              <button onClick={() => deplacer(i, 1)} className="p-1 text-ink-500 hover:text-ink-900" aria-label="Descendre"><ArrowDown size={14} /></button>
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={r.verrouillee} className="p-1 text-ink-500 hover:text-danger-500 disabled:opacity-30"
                aria-label="Supprimer l'étape" title={r.verrouillee ? "Étape déjà facturée" : undefined}><Trash2 size={14} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pl-7">
              <input aria-label="Phase" placeholder="Phase" list="phases-projet" className={champ} value={r.phase} onChange={(e) => maj(i, { phase: e.target.value })} />
              <input aria-label="Description" placeholder="Description (facultatif)" className={champ} value={r.description} onChange={(e) => maj(i, { description: e.target.value })} />
              <input aria-label="Date prévue" type="date" className={champ} value={r.date_prevue} onChange={(e) => maj(i, { date_prevue: e.target.value })} />
            </div>
            <div className="mt-2 pl-7" title={r.verrouillee ? "Étape déjà facturée : sa règle ne peut plus changer" : undefined}>
              <EditeurRegle r={r.facturation} disabled={r.verrouillee} onChange={(x) => maj(i, { facturation: x })} />
            </div>
            {modeles.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pl-7 text-xs text-ink-700">
                <span className="text-ink-500">Documents à générer :</span>
                {modeles.map((m) => (
                  <label key={m.id} className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={r.modeles.includes(m.id)}
                      onChange={(e) => maj(i, { modeles: e.target.checked ? [...r.modeles, m.id] : r.modeles.filter((x) => x !== m.id) })} />
                    {m.titre}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <datalist id="phases-projet">{phases.map((x) => <option key={x} value={x} />)}</datalist>
        <Bouton onClick={() => setRows([...rows, { phase: rows[rows.length - 1]?.phase || "", nom: "Nouvelle étape", description: "", facturation: { ...REGLE_VIDE }, date_prevue: "", modeles: [], verrouillee: false }])}>
          <Plus size={12} /> Ajouter une étape
        </Bouton>
      </div>
      {err && <div className="mt-3 text-sm text-danger-500">{err}</div>}
    </Modal>
  );
}

function GenererDocument({ p, modeles, etapeId, modeleInitial, onClose, onFait }: {
  p: ProjetDetail; modeles: Modele[]; etapeId: string | null; modeleInitial?: number; onClose: () => void; onFait: (x: ProjetDetail, docId: number) => void;
}) {
  const etape = p.etapes.find((e) => e.id === etapeId);
  const [modele, setModele] = useState<number | "">(modeleInitial ?? etape?.modeles[0] ?? modeles[0]?.id ?? "");
  const [pourEtape, setPourEtape] = useState<string>(etapeId || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const generer = async () => {
    if (!modele) return;
    setBusy(true);
    try {
      const r = await projets.generer(p.id, Number(modele), pourEtape || null);
      onFait(r.projet, r.document_id);
    } catch (e) {
      setErr(String((e as Error).message || e));
      setBusy(false);
    }
  };
  return (
    <Modal titre="Générer un contrat ou une convention" onClose={onClose}
      pied={<><Bouton onClick={onClose} variante="discret">Annuler</Bouton><Bouton onClick={generer} variante="primaire" disabled={busy || !modele}>{busy ? "Génération…" : "Générer le PDF"}</Bouton></>}>
      {modeles.length === 0 ? (
        <p className="text-sm text-ink-700">Aucun modèle disponible. Un administrateur peut en créer dans « Parcours et modèles ».</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={etiquette} htmlFor="gd-modele">Modèle</label>
            <select id="gd-modele" className={champ} value={modele} onChange={(e) => setModele(Number(e.target.value))}>
              {modeles.map((m) => <option key={m.id} value={m.id}>{m.titre}</option>)}
            </select>
          </div>
          <div>
            <label className={etiquette} htmlFor="gd-etape">Étape concernée (facultatif)</label>
            <select id="gd-etape" className={champ} value={pourEtape} onChange={(e) => setPourEtape(e.target.value)}>
              <option value="">— projet entier —</option>
              {p.etapes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
          <p className="text-xs text-ink-500">
            Les informations du projet, du client et de la SCIC remplissent le modèle. Le PDF est rangé dans votre porte-documents
            (dossier « Projets ») et partagé avec le responsable du projet ; vous pourrez ensuite l'envoyer pour signature.
          </p>
        </div>
      )}
      {err && <div className="mt-3 text-sm text-danger-500">{err}</div>}
    </Modal>
  );
}
