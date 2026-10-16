"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, Check, CircleSlash, ClipboardList, Eye, FileSignature, FileText, Plus, X } from "lucide-react";
import { collab, LIBELLES_TYPE, type Tache } from "@/lib/collab";
import { fmtDate, fmtDateHeure, joursRestants } from "@/lib/dates";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { Bouton, champ } from "@/components/collab/modal";
import { TacheModal } from "@/components/collab/tache-modal";
import { BadgeStatut, BadgeType } from "@/components/collab/badges";

type Boite = "recues" | "envoyees";
type Filtre = "a_faire" | "cloturees" | "toutes";

export function TachesClient() {
  const router = useRouter();
  const params = useSearchParams();
  const idUrl = params.get("id") ? Number(params.get("id")) : null;
  const [boite, setBoite] = useState<Boite>("recues");
  const [filtre, setFiltre] = useState<Filtre>("a_faire");
  const [rows, setRows] = useState<Tache[]>([]);
  const [compteurs, setCompteurs] = useState({ a_faire: 0, envoyees_en_attente: 0, en_retard: 0 });
  const [sel, setSel] = useState<Tache | null>(null);
  const [creer, setCreer] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [connecte, setConnecte] = useState<boolean | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [r, c] = await Promise.all([
        collab.taches(boite, filtre === "toutes" ? undefined : filtre),
        collab.compteurs(),
      ]);
      setRows(r);
      setCompteurs(c);
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    } finally {
      setChargement(false);
    }
  }, [boite, filtre]);

  useEffect(() => {
    const ok = !!getUser();
    setConnecte(ok);
    if (ok) charger();
  }, [charger]);

  // Ouverture depuis une notification (?id=…)
  useEffect(() => {
    if (!idUrl || !getUser()) return;
    collab
      .tache(idUrl)
      .then((t) => {
        setSel(t);
        const moi = getUser()?.username;
        setBoite(t.destinataire === moi ? "recues" : "envoyees");
        setFiltre(t.statut === "a_faire" ? "a_faire" : "toutes");
      })
      .catch((e) => setMsg({ ok: false, t: String(e.message || e) }));
  }, [idUrl]);

  const ouvrir = async (t: Tache) => {
    router.replace(`/taches?id=${t.id}`, { scroll: false });
    try {
      setSel(await collab.tache(t.id));
    } catch {
      setSel(t);
    }
  };

  const apresAction = async (texte: string) => {
    setMsg({ ok: true, t: texte });
    await charger();
    if (sel) setSel(await collab.tache(sel.id).catch(() => null));
  };

  if (connecte === false)
    return (
      <div className="px-6 py-10 text-sm text-ink-700">
        <Link href="/login" className="text-brand-500 hover:underline">Connectez-vous</Link> pour voir vos tâches.
      </div>
    );

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <ClipboardList size={11} /> Équipe
          </div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Mes tâches</h1>
          <p className="text-sm text-ink-500 mt-1">Demandes de validation, de consultation et de signature — chaque envoi et chaque réponse sont notifiés.</p>
        </div>
        <Bouton onClick={() => setCreer(true)} variante="primaire">
          <Plus size={13} /> Nouvelle tâche
        </Bouton>
      </div>

      {msg && (
        <div className={cn("mb-4 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-sm border border-paper-200 bg-white overflow-hidden">
          {(
            [
              ["recues", `Reçues`, compteurs.a_faire],
              ["envoyees", `Envoyées`, compteurs.envoyees_en_attente],
            ] as const
          ).map(([k, l, n]) => (
            <button
              key={k}
              onClick={() => { setBoite(k); setSel(null); router.replace("/taches", { scroll: false }); }}
              className={cn("px-4 py-1.5 text-sm inline-flex items-center gap-2", boite === k ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-paper-50")}
            >
              {l}
              {n > 0 && <span className={cn("text-[11px] px-1.5 rounded-full", boite === k ? "bg-white/25" : "bg-paper-200")}>{n}</span>}
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1">
          {(
            [
              ["a_faire", boite === "recues" ? "À traiter" : "En attente"],
              ["cloturees", "Clôturées"],
              ["toutes", "Toutes"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setFiltre(k)} className={cn("text-xs px-3 py-1.5 rounded-sm border", filtre === k ? "border-brand-500 text-brand-700 bg-brand-50" : "border-paper-200 text-ink-500 hover:text-ink-900")}>
              {l}
            </button>
          ))}
        </div>
        {compteurs.en_retard > 0 && boite === "recues" && (
          <span className="text-xs text-danger-500 font-medium">{compteurs.en_retard} en retard</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 rounded-sm border border-paper-200 bg-white overflow-hidden self-start">
          {chargement && <div className="p-4 text-sm text-ink-500 italic">Chargement…</div>}
          {!chargement && rows.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-500">
              {boite === "recues" ? "Aucune tâche à traiter." : "Aucune tâche envoyée."}
            </div>
          )}
          <ul>
            {rows.map((t) => {
              const j = joursRestants(t.echeance);
              return (
                <li key={t.id}>
                  <button
                    onClick={() => ouvrir(t)}
                    className={cn("w-full text-left px-4 py-3 border-b border-paper-200 hover:bg-paper-50 transition", sel?.id === t.id && "bg-brand-50/60")}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BadgeType type={t.type_tache} />
                      {t.priorite !== "normale" && (
                        <span className={cn("text-[11px] font-semibold uppercase", t.priorite === "urgente" ? "text-danger-500" : "text-warn-500")}>{t.priorite}</span>
                      )}
                      <span className="ml-auto"><BadgeStatut t={t} /></span>
                    </div>
                    <div className="text-sm text-ink-900 font-medium leading-snug">{t.titre}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{boite === "recues" ? `de ${t.emetteur_nom}` : `à ${t.destinataire_nom}`}</span>
                      {t.echeance && (
                        <span className={cn(t.en_retard && "text-danger-500")}>
                          échéance {fmtDate(t.echeance)}
                          {t.statut === "a_faire" && j !== null && j >= 0 && j <= 3 ? ` (J-${j})` : ""}
                        </span>
                      )}
                      {t.document_titre && <span className="inline-flex items-center gap-0.5"><FileText size={10} /> {t.document_titre}</span>}
                      {boite === "envoyees" && t.statut === "a_faire" && <span>{t.vue_at ? "vue" : "non ouverte"}</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:col-span-3">
          {sel ? (
            <Detail t={sel} onFermer={() => { setSel(null); router.replace("/taches", { scroll: false }); }} onAction={apresAction} onErreur={(e) => setMsg({ ok: false, t: e })} />
          ) : (
            <div className="hidden lg:flex rounded-sm border border-dashed border-paper-200 p-10 text-sm text-ink-500 items-center justify-center">
              Sélectionnez une tâche pour la consulter ou y répondre.
            </div>
          )}
        </div>
      </div>

      {creer && <TacheModal onClose={() => setCreer(false)} onCree={(n) => { setBoite("envoyees"); setFiltre("a_faire"); setMsg({ ok: true, t: `${n} tâche${n > 1 ? "s envoyées" : " envoyée"} — le${n > 1 ? "s" : ""} destinataire${n > 1 ? "s ont" : " a"} été notifié${n > 1 ? "s" : ""}.` }); }} />}
    </div>
  );
}

function Detail({ t, onFermer, onAction, onErreur }: { t: Tache; onFermer: () => void; onAction: (m: string) => void; onErreur: (m: string) => void }) {
  const moi = getUser()?.username;
  const recue = t.destinataire === moi;
  const envoyee = t.emetteur === moi;
  const [commentaire, setCommentaire] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setCommentaire(""), [t.id]);

  const repondre = async (reponse: string, texte: string) => {
    setBusy(true);
    try {
      await collab.repondre(t.id, reponse, commentaire);
      onAction(texte);
    } catch (e) {
      onErreur(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };
  const action = async (fn: () => Promise<unknown>, texte: string) => {
    setBusy(true);
    try {
      await fn();
      onAction(texte);
    } catch (e) {
      onErreur(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const lienDoc = t.document_id ? `/documents/${t.document_id}${recue && t.type_tache === "signature" && t.statut === "a_faire" ? `?tache=${t.id}` : ""}` : null;
  const groupe = useMemo(() => (t.groupe_taches || []).filter((x) => x.id !== t.id || (t.groupe_taches || []).length > 1), [t]);

  return (
    <div className="rounded-sm border border-paper-200 bg-white">
      <div className="px-5 py-4 border-b border-paper-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1"><BadgeType type={t.type_tache} /><BadgeStatut t={t} /></div>
          <h2 className="font-serif text-xl text-ink-900">{t.titre}</h2>
        </div>
        <button onClick={onFermer} className="p-1 text-ink-500 hover:text-ink-900" aria-label="Fermer"><X size={16} /></button>
      </div>

      <dl className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Info l="Demandée par" v={t.emetteur_nom} />
        <Info l="Destinataire" v={t.destinataire_nom} />
        <Info l="Envoyée le" v={fmtDateHeure(t.created_at)} />
        <Info l="Échéance" v={t.echeance ? fmtDate(t.echeance) : "—"} rouge={t.en_retard} />
        <Info l="Ouverte par le destinataire" v={t.vue_at ? fmtDateHeure(t.vue_at) : "pas encore"} />
        <Info l="Clôturée le" v={t.terminee_at ? fmtDateHeure(t.terminee_at) : "—"} />
        {t.operation_nom && <Info l="Opération" v={<Link href={`/operations/${t.operation_id}`} className="text-brand-500 hover:underline">{t.operation_nom}</Link>} />}
        <Info l="Priorité" v={t.priorite} />
      </dl>

      {t.description && <div className="px-5 pb-4 text-sm text-ink-700 whitespace-pre-wrap">{t.description}</div>}

      {lienDoc && (
        <div className="mx-5 mb-4 rounded-sm border border-paper-200 bg-paper-50 px-4 py-3 flex flex-wrap items-center gap-3">
          <FileText size={16} className="text-ink-500" />
          <span className="text-sm text-ink-900 flex-1 min-w-0 truncate">{t.document_titre}</span>
          <Link href={lienDoc} className="text-xs px-3 py-1.5 rounded-sm border border-paper-200 bg-white hover:border-ink-300 inline-flex items-center gap-1.5">
            <Eye size={12} /> Ouvrir le document
          </Link>
        </div>
      )}

      {t.statut !== "a_faire" && t.statut !== "annulee" && (
        <div className="mx-5 mb-4 rounded-sm border border-paper-200 px-4 py-3 text-sm">
          <div className="text-[11px] text-ink-500 mb-1">Réponse du destinataire</div>
          <BadgeStatut t={t} />
          {t.commentaire_reponse && <p className="mt-2 text-ink-700 whitespace-pre-wrap">{t.commentaire_reponse}</p>}
        </div>
      )}

      {recue && t.statut === "a_faire" && (
        <div className="px-5 py-4 border-t border-paper-200 bg-paper-50/60 space-y-3">
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder={t.type_tache === "consultation" ? "Commentaire (facultatif)" : "Commentaire — obligatoire en cas de refus"}
            className={cn(champ, "h-20")}
          />
          <div className="flex flex-wrap gap-2">
            {t.type_tache === "validation" && (
              <>
                <Bouton onClick={() => repondre("validee", "Tâche validée — l'émetteur a été notifié.")} disabled={busy} variante="succes"><Check size={13} /> Valider</Bouton>
                <Bouton onClick={() => repondre("refusee", "Refus envoyé — l'émetteur a été notifié.")} disabled={busy || !commentaire.trim()} variante="danger" title="Motif obligatoire"><CircleSlash size={13} /> Refuser</Bouton>
              </>
            )}
            {t.type_tache === "consultation" && (
              <Bouton onClick={() => repondre("consultee", "Consultation confirmée — l'émetteur a été notifié.")} disabled={busy} variante="succes"><Eye size={13} /> Marquer comme consulté</Bouton>
            )}
            {t.type_tache === "signature" && (
              <>
                {lienDoc && (
                  <Link href={lienDoc} className="text-xs px-3 py-1.5 rounded-sm border border-ok-500 bg-ok-500 text-white inline-flex items-center gap-1.5 hover:opacity-90">
                    <FileSignature size={13} /> Signer le document
                  </Link>
                )}
                <Bouton onClick={() => repondre("refusee", "Refus de signer envoyé — l'émetteur a été notifié.")} disabled={busy || !commentaire.trim()} variante="danger"><CircleSlash size={13} /> Refuser de signer</Bouton>
              </>
            )}
            {t.type_tache === "autre" && (
              <>
                <Bouton onClick={() => repondre("faite", "Tâche terminée — l'émetteur a été notifié.")} disabled={busy} variante="succes"><Check size={13} /> Marquer comme faite</Bouton>
                <Bouton onClick={() => repondre("refusee", "Refus envoyé.")} disabled={busy || !commentaire.trim()} variante="danger"><CircleSlash size={13} /> Refuser</Bouton>
              </>
            )}
          </div>
        </div>
      )}

      {envoyee && (
        <div className="px-5 py-4 border-t border-paper-200 space-y-3">
          {groupe.length > 1 && (
            <div>
              <div className="text-[11px] text-ink-500 mb-1.5">Suivi de l'envoi ({groupe.length} destinataires)</div>
              <ul className="rounded-sm border border-paper-200 divide-y divide-paper-200">
                {groupe.map((g) => (
                  <li key={g.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                    <span className="text-ink-900 flex-1">{g.destinataire_nom}</span>
                    <span className="text-[11px] text-ink-500">{g.vue_at ? `vue le ${fmtDate(g.vue_at)}` : "non ouverte"}</span>
                    <BadgeStatut t={g} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {t.statut === "a_faire" && (
            <div className="flex flex-wrap gap-2">
              <Bouton onClick={() => action(() => collab.relancer(t.id), `Relance envoyée à ${t.destinataire_nom}.`)} disabled={busy}><BellRing size={13} /> Relancer</Bouton>
              <Bouton onClick={() => confirm(`Annuler la tâche « ${t.titre} » pour ${t.destinataire_nom} ?`) && action(() => collab.annuler(t.id), "Tâche annulée — le destinataire a été notifié.")} disabled={busy} variante="danger"><X size={13} /> Annuler la tâche</Bouton>
            </div>
          )}
        </div>
      )}
      <p className="px-5 pb-4 text-[11px] text-ink-300">{LIBELLES_TYPE[t.type_tache]} n° {t.id}</p>
    </div>
  );
}

function Info({ l, v, rouge }: { l: string; v: React.ReactNode; rouge?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-500">{l}</dt>
      <dd className={cn("text-ink-900", rouge && "text-danger-500 font-medium")}>{v}</dd>
    </div>
  );
}
