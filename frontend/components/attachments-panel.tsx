"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { Paperclip, Upload, Download, Trash2, File as FileIcon } from "lucide-react";

type A = { id: number; filename: string; mimetype: string; size: number; description: string; uploaded_by: string; uploaded_at: string };

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

export function AttachmentsPanel({
  parentType,
  parentId,
  title = "Pièces jointes",
}: {
  parentType: "operation" | "phase" | "event" | "scenario";
  parentId: number;
  title?: string;
}) {
  const [items, setItems] = useState<A[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canEdit = typeof window !== "undefined" && !!getUser();

  const reload = async () => {
    setLoading(true);
    try {
      setItems(await api.listAttachments(parentType, parentId));
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [parentType, parentId]);

  const handleUpload = async (file: File) => {
    setErr(null);
    setUploading(true);
    try {
      await api.uploadAttachment(parentType, parentId, file, description);
      setDescription("");
      if (inputRef.current) inputRef.current.value = "";
      await reload();
    } catch (e) { setErr(String(e)); }
    finally { setUploading(false); }
  };

  const handleDownload = async (att: A) => {
    const token = getToken();
    try {
      const res = await fetch(`/api/attachments/download/${att.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Téléchargement refusé");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e); }
  };

  const handleDelete = async (att: A) => {
    if (!confirm(`Supprimer ${att.filename} ?`)) return;
    try { await api.deleteAttachment(att.id); await reload(); } catch (e) { alert(e); }
  };

  return (
    <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-paper-200 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-ink-500 font-medium flex items-center gap-2">
          <Paperclip size={11} /> {title} ({items.length})
        </div>
      </div>

      {canEdit && (
        <div className="px-4 py-3 border-b border-paper-200 bg-paper-50/60">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Description (optionnelle)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 px-2 py-1 border border-paper-200 rounded-sm text-xs"
            />
            <input
              ref={inputRef}
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
              className="hidden"
              id={`file-input-${parentType}-${parentId}`}
            />
            <label
              htmlFor={`file-input-${parentType}-${parentId}`}
              className={`cursor-pointer text-xs px-3 py-1 bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-1.5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
            >
              <Upload size={12} /> {uploading ? "Upload…" : "Ajouter"}
            </label>
          </div>
          {err && <div className="text-xs text-danger-500 mt-2">{err}</div>}
        </div>
      )}

      {loading && <div className="px-4 py-3 text-xs text-ink-500 italic">Chargement…</div>}
      {!loading && items.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-ink-500 italic">
          Aucune pièce jointe. {canEdit ? "Dépose un fichier ci-dessus." : "Connecte-toi pour ajouter."}
        </div>
      )}
      <ul className="divide-y divide-paper-200">
        {items.map((att) => (
          <li key={att.id} className="px-4 py-2 flex items-center gap-3 hover:bg-paper-50/50">
            <FileIcon size={16} className="text-ink-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink-900 truncate">{att.filename}</div>
              <div className="text-[10px] text-ink-500">
                {fmtSize(att.size)} · par {att.uploaded_by} · {new Date(att.uploaded_at).toLocaleString("fr-FR")}
                {att.description && <> · {att.description}</>}
              </div>
            </div>
            <button onClick={() => handleDownload(att)} className="p-1 text-ink-500 hover:text-brand-500" title="Télécharger">
              <Download size={13} />
            </button>
            {canEdit && (
              <button onClick={() => handleDelete(att)} className="p-1 text-ink-500 hover:text-danger-500" title="Supprimer">
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
