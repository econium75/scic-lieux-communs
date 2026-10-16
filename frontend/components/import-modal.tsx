"use client";
import { useState, useRef } from "react";
import { Upload, Download, X, CheckCircle2, AlertCircle } from "lucide-react";

export function ImportModal({
  open,
  onClose,
  title,
  description,
  templateUrl,
  templateLabel,
  acceptedExtensions = ".xlsx,.xls",
  extraFields,
  doImport,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  templateUrl?: string;
  templateLabel?: string;
  acceptedExtensions?: string;
  extraFields?: React.ReactNode;
  doImport: (file: File) => Promise<{ ok: boolean; nb_crees: number; crees?: string[]; erreurs?: { ligne: number; erreur: string }[] }>;
  onSuccess?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof doImport>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const close = () => {
    setFile(null);
    setResult(null);
    setErr(null);
    if (inputRef.current) inputRef.current.value = "";
    onClose();
  };

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await doImport(file);
      setResult(r);
      if (r.ok && onSuccess) onSuccess();
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink-900/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-paper-200 flex items-center justify-between">
          <h2 className="font-serif text-lg text-ink-900">{title}</h2>
          <button onClick={close} className="p-1 text-ink-500 hover:text-ink-900"><X size={16} /></button>
        </div>
        <div className="p-5">
          <p className="text-sm text-ink-700 mb-4">{description}</p>

          {templateUrl && (
            <a
              href={templateUrl}
              className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:underline mb-4"
            >
              <Download size={12} /> {templateLabel || "Télécharger le gabarit"}
            </a>
          )}

          {extraFields && <div className="mb-4">{extraFields}</div>}

          <label className="block mb-4">
            <span className="text-[11px] uppercase tracking-widest text-ink-500">Fichier</span>
            <input
              ref={inputRef}
              type="file"
              accept={acceptedExtensions}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1 w-full text-xs"
            />
          </label>

          {err && (
            <div className="rounded-sm border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs text-ink-700 mb-4">
              {err}
            </div>
          )}

          {result && (
            <div className={`rounded-sm border p-3 mb-4 ${result.nb_crees > 0 ? "border-ok-500/40 bg-ok-50" : "border-warn-500/40 bg-warn-50"}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.nb_crees > 0 ? <CheckCircle2 size={14} className="text-ok-500" /> : <AlertCircle size={14} className="text-warn-500" />}
                <span className="text-sm font-medium">{result.nb_crees} ligne(s) importée(s)</span>
              </div>
              {result.erreurs && result.erreurs.length > 0 && (
                <div className="mt-2 text-xs text-danger-500">
                  <div className="font-medium mb-1">{result.erreurs.length} erreur(s) :</div>
                  <ul className="list-disc list-inside">
                    {result.erreurs.slice(0, 5).map((er, i) => (
                      <li key={i}>Ligne {er.ligne} : {er.erreur}</li>
                    ))}
                    {result.erreurs.length > 5 && <li className="italic">… et {result.erreurs.length - 5} autres</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button onClick={close} className="text-xs px-3 py-1.5 border border-ink-300 text-ink-700 rounded-sm hover:bg-paper-100">
              Fermer
            </button>
            <button
              onClick={run}
              disabled={!file || loading}
              className="text-xs px-4 py-1.5 bg-brand-500 text-white rounded-sm hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Upload size={12} /> {loading ? "Import…" : "Importer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
