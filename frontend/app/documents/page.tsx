"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileSignature, FileText, Folder, FolderOpen, PenLine, Send, Share2, Trash2, Upload, X } from "lucide-react";
import { collab, telecharger, tailleLisible, type Doc, type TypeTache } from "@/lib/collab";
import { fmtDateHeure } from "@/lib/dates";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { Bouton, Modal, champ, etiquette } from "@/components/collab/modal";
import { MaSignature } from "@/components/collab/signature-pad";
import { TacheModal } from "@/components/collab/tache-modal";
import { UserPicker } from "@/components/collab/user-picker";

const VUES = [
  { k: "tous", l: "Tous mes documents", icon: FolderOpen },
  { k: "mes", l: "Importés par moi", icon: Folder },
  { k: "partages", l: "Partagés avec moi", icon: Share2 },
  { k: "a_signer", l: "À signer", icon: FileSignature },
  { k: "signes", l: "Signés", icon: PenLine },
] as const;

export default function PorteDocumentsPage() {
  const [vue, setVue] = useState<string>("tous");
  const [dossier, setDossier] = useState<string | null>(null);
  const [rows, setRows] = useState<Doc[]>([]);
  const [dossiers, setDossiers] = useState<string[]>(["Général"]);
  const [chargement, setChargement] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [envoi, setEnvoi] = useState<{ doc: Doc; type: TypeTache } | null>(null);
  const [partage, setPartage] = useState<Doc | null>(null);
  const [signature, setSignature] = useState(false);
  const [dossierImport, setDossierImport] = useState("Général");
  const [survol, setSurvol] = useState(false);
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await collab.documents(vue, dossier || undefined);
      setRows(r.rows);
      setDossiers(r.dossiers);
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    } finally {
      setChargement(false);
    }
  }, [vue, dossier]);

  useEffect(() => {
    const ok = !!getUser();
    setConnecte(ok);
    if (ok) charger();
  }, [charger]);

  const importer = async (files: FileList | File[]) => {
    const liste = Array.from(files);
    if (!liste.length) return;
    setMsg({ ok: true, t: `Import de ${liste.length} fichier(s)…` });
    const erreurs: string[] = [];
    for (const f of liste) {
      try {
        await collab.importer(f, { dossier: dossierImport });
      } catch (e) {
        erreurs.push(`${f.name} : ${(e as Error).message}`);
      }
    }
    setMsg(erreurs.length ? { ok: false, t: erreurs.join(" · ") } : { ok: true, t: `${liste.length} document(s) importé(s) dans « ${dossierImport} ».` });
    if (inputRef.current) inputRef.current.value = "";
    charger();
  };

  const supprimer = async (d: Doc) => {
    if (!confirm(`Supprimer définitivement « ${d.titre} » et toutes ses versions ?`)) return;
    try {
      await collab.supprimerDocument(d.id);
      setMsg({ ok: true, t: "Document supprimé." });
      charger();
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    }
  };

  if (connecte === false)
    return (
      <div className="px-6 py-10 text-sm text-ink-700">
        <Link href="/login" className="text-brand-500 hover:underline">Connectez-vous</Link> pour accéder à votre porte-documents.
      </div>
    );

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500 flex items-center gap-2"><FolderOpen size={11} /> Équipe</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Porte-documents</h1>
          <p className="text-sm text-ink-500 mt-1">Vos documents personnels : privés par défaut, partagés quand vous le décidez ou quand vous les joignez à une tâche.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Bouton onClick={() => setSignature(true)}><PenLine size={13} /> Ma signature</Bouton>
          <Bouton onClick={() => inputRef.current?.click()} variante="primaire"><Upload size={13} /> Importer des PDF</Bouton>
          <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf,image/*,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => e.target.files && importer(e.target.files)} />
        </div>
      </div>

      {msg && (
        <div className={cn("mb-4 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <aside className="space-y-4">
          <nav className="rounded-sm border border-paper-200 bg-white overflow-hidden">
            {VUES.map((v) => (
              <button key={v.k} onClick={() => { setVue(v.k); setDossier(null); }} className={cn("w-full flex items-center gap-2 px-4 py-2 text-sm text-left border-b border-paper-200 last:border-b-0", vue === v.k && !dossier ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-700 hover:bg-paper-50")}>
                <v.icon size={14} className="shrink-0" /> {v.l}
              </button>
            ))}
          </nav>
          <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
            <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-500 border-b border-paper-200">Mes dossiers</div>
            {dossiers.map((d) => (
              <button key={d} onClick={() => { setVue("mes"); setDossier(d); }} className={cn("w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left", dossier === d ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-700 hover:bg-paper-50")}>
                <Folder size={13} className="shrink-0" /> {d}
              </button>
            ))}
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => { e.preventDefault(); setSurvol(false); importer(e.dataTransfer.files); }}
            className={cn("rounded-sm border-2 border-dashed p-4 text-center text-xs transition", survol ? "border-brand-500 bg-brand-50 text-brand-700" : "border-paper-200 text-ink-500")}
          >
            <Upload size={18} className="mx-auto mb-1" />
            Glissez vos PDF ici
            <div className="mt-2 flex items-center gap-1.5">
              <span className="whitespace-nowrap">Dossier :</span>
              <input list="dossiers" value={dossierImport} onChange={(e) => setDossierImport(e.target.value)} className={cn(champ, "py-1 text-xs")} />
              <datalist id="dossiers">{dossiers.map((d) => <option key={d} value={d} />)}</datalist>
            </div>
          </div>
        </aside>

        <section className="lg:col-span-3 rounded-sm border border-paper-200 bg-white overflow-hidden self-start">
          {chargement && <div className="p-4 text-sm text-ink-500 italic">Chargement…</div>}
          {!chargement && rows.length === 0 && (
            <div className="p-10 text-center text-sm text-ink-500">
              {vue === "a_signer" ? "Aucun document en attente de votre signature." : "Aucun document ici. Importez un PDF pour commencer."}
            </div>
          )}
          <ul className="divide-y divide-paper-200">
            {rows.map((d) => (
              <li key={d.id} className="px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3 hover:bg-paper-50/60">
                <FileText size={22} className={cn("shrink-0", d.statut === "signe" ? "text-ok-500" : "text-ink-300")} />
                <div className="min-w-0 flex-1">
                  <Link href={`/documents/${d.id}${d.tache_signature_id ? `?tache=${d.tache_signature_id}` : ""}`} className="text-sm font-medium text-ink-900 hover:underline">
                    {d.titre}
                  </Link>
                  <div className="text-[11px] text-ink-500 flex flex-wrap gap-x-3">
                    <span>{d.dossier}</span>
                    <span>v{d.version_courante}</span>
                    {d.est_pdf && <span>{d.nb_pages} p.</span>}
                    <span>{tailleLisible(d.taille)}</span>
                    <span>modifié {fmtDateHeure(d.updated_at)}</span>
                    {d.acces === "partage" && <span>de {d.proprietaire_nom}</span>}
                    {d.partage_avec.length > 0 && d.acces === "proprietaire" && <span>partagé ({d.partage_avec.length})</span>}
                  </div>
                </div>
                {d.statut === "signe" && <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-ok-50 text-ok-500 font-medium">Signé</span>}
                {d.tache_signature_id && (
                  <Link href={`/documents/${d.id}?tache=${d.tache_signature_id}`} className="text-[11px] px-2 py-1 rounded-sm bg-warn-50 text-warn-500 font-medium">
                    À signer
                  </Link>
                )}
                <div className="flex items-center gap-0.5">
                  <IconBtn titre="Télécharger" onClick={() => telecharger(`/api/documents/${d.id}/versions/${d.version_courante}/fichier`, d.nom_fichier)}><Download size={14} /></IconBtn>
                  <IconBtn titre="Envoyer pour validation / consultation / signature" onClick={() => setEnvoi({ doc: d, type: d.est_pdf ? "signature" : "consultation" })}><Send size={14} /></IconBtn>
                  {d.acces === "proprietaire" && <IconBtn titre="Partager" onClick={() => setPartage(d)}><Share2 size={14} /></IconBtn>}
                  {d.acces === "proprietaire" && <IconBtn titre="Supprimer" onClick={() => supprimer(d)} danger><Trash2 size={14} /></IconBtn>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {signature && (
        <Modal titre="Ma signature" onClose={() => setSignature(false)}>
          <MaSignature onEnregistree={() => setTimeout(() => setSignature(false), 800)} />
        </Modal>
      )}
      {envoi && (
        <TacheModal
          onClose={() => setEnvoi(null)}
          initial={{ document_id: envoi.doc.id, type_tache: envoi.type, titre: `${envoi.type === "signature" ? "Signer" : "Consulter"} : ${envoi.doc.titre}` }}
          onCree={(n) => { setMsg({ ok: true, t: `Demande envoyée à ${n} personne(s), notifiée(s).` }); charger(); }}
        />
      )}
      {partage && <PartageModal doc={partage} onClose={() => setPartage(null)} onFait={() => { setPartage(null); setMsg({ ok: true, t: "Partage mis à jour — les nouveaux destinataires ont été notifiés." }); charger(); }} />}
    </div>
  );
}

function IconBtn({ children, titre, onClick, danger }: { children: React.ReactNode; titre: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} title={titre} aria-label={titre} className={cn("p-1.5 rounded-sm text-ink-500 hover:bg-paper-100", danger ? "hover:text-danger-500" : "hover:text-ink-900")}>
      {children}
    </button>
  );
}

function PartageModal({ doc, onClose, onFait }: { doc: Doc; onClose: () => void; onFait: () => void }) {
  const [users, setUsers] = useState<string[]>(doc.partage_avec);
  const [titre, setTitre] = useState(doc.titre);
  const [dossier, setDossier] = useState(doc.dossier);
  const [err, setErr] = useState<string | null>(null);
  const enregistrer = async () => {
    try {
      await collab.modifierDocument(doc.id, { partage_avec: users, titre, dossier });
      onFait();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  };
  return (
    <Modal titre={`Partager « ${doc.titre} »`} onClose={onClose} pied={<><Bouton onClick={onClose} variante="discret">Annuler</Bouton><Bouton onClick={enregistrer} variante="primaire">Enregistrer</Bouton></>}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div><label className={etiquette}>Titre</label><input className={champ} value={titre} onChange={(e) => setTitre(e.target.value)} /></div>
        <div><label className={etiquette}>Dossier</label><input className={champ} value={dossier} onChange={(e) => setDossier(e.target.value)} /></div>
      </div>
      <label className={etiquette}>Personnes ayant accès (lecture, annotation, signature)</label>
      <UserPicker value={users} onChange={setUsers} />
      {err && <div className="mt-3 text-sm text-danger-500">{err}</div>}
    </Modal>
  );
}
