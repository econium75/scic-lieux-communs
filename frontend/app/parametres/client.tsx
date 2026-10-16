"use client";
import { useState, useTransition, useRef } from "react";
import { api } from "@/lib/api";
import { Save, RotateCcw, Upload, Download } from "lucide-react";

type Ref = {
  id: number;
  code: string;
  label: string;
  data: Record<string, unknown>;
  updated_at: string;
};

export function ReferentielsClient({ initial }: { initial: Ref[] }) {
  const [refs, setRefs] = useState<Ref[]>(initial);
  const [editing, setEditing] = useState<Record<string, Record<string, unknown>>>({});
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const update = (code: string, path: string[], v: unknown) => {
    setEditing((prev) => {
      const base = prev[code] ?? (refs.find((r) => r.code === code)?.data || {});
      const next = JSON.parse(JSON.stringify(base));
      let obj: Record<string, unknown> = next;
      for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i]] as Record<string, unknown>;
      }
      obj[path[path.length - 1]] = v;
      return { ...prev, [code]: next };
    });
  };

  const save = (code: string) => {
    const data = editing[code];
    if (!data) return;
    setMsg(null);
    start(async () => {
      try {
        await api.updateReferentiel(code, data);
        setRefs((prev) => prev.map((r) => (r.code === code ? { ...r, data, updated_at: new Date().toISOString() } : r)));
        setEditing((prev) => {
          const next = { ...prev };
          delete next[code];
          return next;
        });
        setMsg(`${code} sauvegardé.`);
        setTimeout(() => setMsg(null), 3000);
      } catch (e) {
        setMsg(`Erreur : ${e}`);
      }
    });
  };

  const cancel = (code: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  };

  if (refs.length === 0) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
        <div className="rounded-sm border border-paper-200 bg-white p-6 text-sm text-ink-500">
          Backend injoignable ou aucun référentiel.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-5xl">
      <div className="text-[11px] uppercase tracking-widest text-ink-500">M1 — Référentiels globaux</div>
      <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1 mb-2">Paramètres</h1>
      <p className="text-sm text-ink-500 mb-6">
        Référentiels partagés par toutes les opérations. L'édition est persistée en base.
      </p>

      {msg && (
        <div className="rounded-sm border border-ok-500/40 bg-ok-50 px-4 py-2 text-sm text-ink-700 mb-4">
          {msg}
        </div>
      )}

      <div className="space-y-6">
        {refs.map((r) => (
          <RefCard key={r.code} ref_={r} edits={editing[r.code]} update={update} save={save} cancel={cancel} saving={saving} />
        ))}
      </div>
    </div>
  );
}

function RefCard({
  ref_,
  edits,
  update,
  save,
  cancel,
  saving,
}: {
  ref_: Ref;
  edits?: Record<string, unknown>;
  update: (code: string, path: string[], v: unknown) => void;
  save: (code: string) => void;
  cancel: (code: string) => void;
  saving: boolean;
}) {
  const data = edits ?? ref_.data;
  const dirty = !!edits;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const r: { nb_entries?: number } = await api.uploadReferentielExcel(ref_.code, f);
      setUploadMsg(`✓ ${r.nb_entries || "?"} entrées importées. Rechargement…`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setUploadMsg(`✗ ${e}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="rounded-sm border border-paper-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-paper-200 flex items-center justify-between">
        <div>
          <h2 className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">{ref_.label}</h2>
          <div className="text-[11px] text-ink-500 italic mt-0.5">
            Code <code>{ref_.code}</code> · maj {new Date(ref_.updated_at).toLocaleString("fr-FR")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/referentiels/${ref_.code}/template.xlsx`}
            className="text-[11px] text-ink-500 hover:text-brand-500 flex items-center gap-1"
            title="Télécharger le gabarit Excel pré-rempli"
          >
            <Download size={11} /> Gabarit
          </a>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="hidden"
            id={`upload-${ref_.code}`}
          />
          <label
            htmlFor={`upload-${ref_.code}`}
            className={`cursor-pointer text-xs px-3 py-1.5 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-1 ${uploading ? "opacity-50" : ""}`}
          >
            <Upload size={11} /> {uploading ? "Upload…" : "Importer Excel"}
          </label>
          {dirty && (
            <>
              <button
                onClick={() => cancel(ref_.code)}
                className="text-xs px-3 py-1.5 border border-ink-300 text-ink-700 rounded-sm hover:bg-paper-100 flex items-center gap-1"
              >
                <RotateCcw size={11} /> Annuler
              </button>
              <button
                onClick={() => save(ref_.code)}
                disabled={saving}
                className="text-xs px-3 py-1.5 bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-1 disabled:opacity-50"
              >
                <Save size={11} /> Sauvegarder
              </button>
            </>
          )}
        </div>
      </div>
      {uploadMsg && (
        <div className="px-5 py-2 text-xs bg-brand-50/50 text-ink-700 border-b border-paper-200">{uploadMsg}</div>
      )}
      <RefEditor code={ref_.code} data={data} update={update} />
    </section>
  );
}

function RefEditor({
  code,
  data,
  update,
}: {
  code: string;
  data: Record<string, unknown>;
  update: (code: string, path: string[], v: unknown) => void;
}) {
  return (
    <div className="p-4">
      <table className="w-full text-sm">
        <tbody>
          {Object.entries(data).map(([k, v]) => (
            <RefRow key={k} code={code} path={[k]} k={k} v={v} update={update} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RefRow({
  code,
  path,
  k,
  v,
  update,
}: {
  code: string;
  path: string[];
  k: string;
  v: unknown;
  update: (code: string, path: string[], v: unknown) => void;
}) {
  if (v !== null && typeof v === "object") {
    // nested dict — e.g. zones_brs → { "1": { libelle, plafond... }}
    return (
      <>
        <tr className="border-t border-paper-200 bg-paper-50">
          <td colSpan={2} className="px-4 py-1 text-[11px] uppercase tracking-widest text-ink-700 font-medium">
            {k}
          </td>
        </tr>
        {Object.entries(v as Record<string, unknown>).map(([k2, v2]) => (
          <RefRow key={k2} code={code} path={[...path, k2]} k={k2} v={v2} update={update} />
        ))}
      </>
    );
  }

  const isNum = typeof v === "number";
  return (
    <tr className="border-t border-paper-200">
      <td className="px-4 py-1 text-ink-700 w-1/2">{path.join(" / ")}</td>
      <td className="px-4 py-1">
        {isNum ? (
          <input
            type="number"
            step={Number.isInteger(v) ? 1 : 0.01}
            value={v as number}
            onChange={(e) => update(code, path, Number(e.target.value))}
            className="w-full text-right tabular-nums border border-paper-200 rounded-sm px-2 py-1 focus:border-brand-500 focus:outline-none"
          />
        ) : (
          <input
            type="text"
            value={String(v ?? "")}
            onChange={(e) => update(code, path, e.target.value)}
            className="w-full border border-paper-200 rounded-sm px-2 py-1 focus:border-brand-500 focus:outline-none"
          />
        )}
      </td>
    </tr>
  );
}
