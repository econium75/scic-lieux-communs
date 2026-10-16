"use client";
import { useEffect, useState } from "react";
import { Send, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { collab, LIBELLES_TYPE, type Doc, type TypeTache } from "@/lib/collab";
import type { Operation } from "@/lib/types";
import { cn } from "@/lib/format";
import { Bouton, Modal, champ, etiquette } from "./modal";
import { UserPicker } from "./user-picker";

const AIDE: Record<TypeTache, string> = {
  validation: "Le destinataire valide ou refuse (motif obligatoire en cas de refus).",
  consultation: "Le destinataire confirme avoir pris connaissance, avec un commentaire éventuel.",
  signature: "Le destinataire signe le PDF dans l'application ; la tâche se clôt à la signature.",
  autre: "Tâche libre, marquée comme faite par le destinataire.",
};

export function TacheModal({
  onClose,
  onCree,
  initial = {},
}: {
  onClose: () => void;
  onCree?: (nb: number) => void;
  initial?: { type_tache?: TypeTache; document_id?: number | null; operation_id?: number | null; titre?: string; destinataires?: string[] };
}) {
  const [type, setType] = useState<TypeTache>(initial.type_tache || "validation");
  const [titre, setTitre] = useState(initial.titre || "");
  const [description, setDescription] = useState("");
  const [destinataires, setDestinataires] = useState<string[]>(initial.destinataires || []);
  const [echeance, setEcheance] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [operationId, setOperationId] = useState<number | null>(initial.operation_id ?? null);
  const [documentId, setDocumentId] = useState<number | null>(initial.document_id ?? null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [fichier, setFichier] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    collab.documents("tous").then((r) => setDocs(r.rows)).catch(() => {});
    api.listOperations().then(setOperations).catch(() => {});
  }, []);

  const docChoisi = docs.find((d) => d.id === documentId);
  const pdfRequis = type === "signature";

  const envoyer = async () => {
    setErr(null);
    if (!titre.trim()) return setErr("Indiquez un titre.");
    if (!destinataires.length) return setErr("Choisissez au moins un destinataire.");
    if (pdfRequis && !documentId && !fichier) return setErr("Joignez le PDF à faire signer.");
    setEnvoi(true);
    try {
      let docId = documentId;
      if (fichier) {
        const d = await collab.importer(fichier, { dossier: "Envois", operation_id: operationId });
        docId = d.id;
      }
      const r = await collab.creerTache({
        type_tache: type,
        titre: titre.trim(),
        description,
        destinataires,
        echeance: echeance ? new Date(`${echeance}T23:59:00`).toISOString() : null,
        priorite,
        operation_id: operationId,
        document_id: docId,
      });
      onCree?.(r.length);
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal
      titre="Nouvelle tâche"
      onClose={onClose}
      large
      pied={
        <>
          <Bouton onClick={onClose} variante="discret">Annuler</Bouton>
          <Bouton onClick={envoyer} disabled={envoi} variante="primaire">
            <Send size={13} /> {envoi ? "Envoi…" : `Envoyer${destinataires.length > 1 ? ` à ${destinataires.length} personnes` : ""}`}
          </Bouton>
        </>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1">
        {(Object.keys(LIBELLES_TYPE) as TypeTache[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "rounded-sm border px-3 py-2 text-sm text-left transition",
              type === t ? "border-brand-500 bg-brand-50 text-brand-700 font-medium" : "border-paper-200 text-ink-700 hover:border-ink-300"
            )}
          >
            {LIBELLES_TYPE[t]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-500 mb-4">{AIDE[type]}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={etiquette}>Titre</label>
          <input className={champ} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="ex. Valider le plan de financement ECON'HOME" />
        </div>
        <div className="sm:col-span-2">
          <label className={etiquette}>Message (facultatif)</label>
          <textarea className={cn(champ, "h-20")} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={etiquette}>Destinataire(s) — une tâche et une notification par personne</label>
          <UserPicker value={destinataires} onChange={setDestinataires} />
        </div>
        <div>
          <label className={etiquette}>Échéance</label>
          <input type="date" className={champ} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        </div>
        <div>
          <label className={etiquette}>Priorité</label>
          <select className={champ} value={priorite} onChange={(e) => setPriorite(e.target.value)}>
            <option value="normale">Normale</option>
            <option value="haute">Haute</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <div>
          <label className={etiquette}>Opération liée (facultatif)</label>
          <select className={champ} value={operationId ?? ""} onChange={(e) => setOperationId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {operations.map((o) => (
              <option key={o.id} value={o.id}>{o.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiquette}>Document {pdfRequis ? "à signer (PDF)" : "joint (facultatif)"}</label>
          <select
            className={champ}
            value={documentId ?? ""}
            onChange={(e) => {
              setDocumentId(e.target.value ? Number(e.target.value) : null);
              setFichier(null);
            }}
          >
            <option value="">{fichier ? `Nouveau : ${fichier.name}` : "— Aucun / importer ci-dessous —"}</option>
            {docs.filter((d) => !pdfRequis || d.est_pdf).map((d) => (
              <option key={d.id} value={d.id}>{d.titre} (v{d.version_courante})</option>
            ))}
          </select>
          <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-brand-500 cursor-pointer hover:underline">
            <Upload size={11} /> Importer un fichier depuis l'ordinateur
            <input
              type="file"
              accept={pdfRequis ? "application/pdf,.pdf" : undefined}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFichier(f);
                if (f) setDocumentId(null);
              }}
            />
          </label>
          {docChoisi && docChoisi.acces === "proprietaire" && destinataires.length > 0 && (
            <p className="text-[11px] text-ink-500 mt-1">Le document sera partagé avec les destinataires.</p>
          )}
        </div>
      </div>
      {err && <div className="mt-4 rounded-sm border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm text-ink-900">{err}</div>}
    </Modal>
  );
}
