"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import type { Operation } from "@/lib/types";
import { ChevronDown, Plus, Pencil, Trash2, Check } from "lucide-react";

type FormState = {
  code: string;
  nom: string;
  commune: string;
  zone_brs: string;
  nb_logements_total: number;
  nb_logements_brs: number;
  nb_logements_pli: number;
  surface_habitable_m2: number;
  livraison_cible: string;
};

const EMPTY: FormState = {
  code: "",
  nom: "",
  commune: "",
  zone_brs: "1bis",
  nb_logements_total: 0,
  nb_logements_brs: 0,
  nb_logements_pli: 0,
  surface_habitable_m2: 0,
  livraison_cible: "T4 2027",
};

export function OperationsSwitcher({
  activeOperationId,
  initialOperations = [],
}: {
  activeOperationId?: number;
  initialOperations?: Operation[];
}) {
  const router = useRouter();
  const [operations, setOperations] = useState<Operation[]>(initialOperations);
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // On vérifie l'auth seulement après mount pour éviter le flash SSR
  const isLogged = mounted && !!getUser();

  const reload = async () => {
    try { setOperations(await api.listOperations()); } catch {}
  };
  useEffect(() => {
    setMounted(true);
    reload();
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const active = operations.find((o) => o.id === activeOperationId) || operations[0] || null;

  const openCreate = () => {
    if (!isLogged) {
      router.push("/login");
      return;
    }
    setForm(EMPTY);
    setEditId(null);
    setErr(null);
    setModal("create");
    setOpen(false);
  };
  const openEdit = () => {
    if (!active) return;
    setForm({
      code: active.code,
      nom: active.nom,
      commune: active.commune,
      zone_brs: active.zone_brs,
      nb_logements_total: active.nb_logements_total,
      nb_logements_brs: active.nb_logements_brs,
      nb_logements_pli: active.nb_logements_pli,
      surface_habitable_m2: active.surface_habitable_m2,
      livraison_cible: active.livraison_cible,
    });
    setEditId(active.id);
    setErr(null);
    setModal("edit");
    setOpen(false);
  };

  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      if (modal === "create") {
        const op = await api.createOperation(form);
        setModal(null);
        await reload();
        router.push(`/operations/${op.id}`);
      } else if (modal === "edit" && editId) {
        await api.updateOperation(editId, form);
        setModal(null);
        await reload();
        router.refresh();
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!active) return;
    if (!confirm(`Supprimer définitivement l'opération « ${active.nom} » et tous ses scénarios ?`)) return;
    try {
      await api.deleteOperation(active.id);
      await reload();
      router.push("/");
    } catch (e) { alert(e); }
  };

  if (!active) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-ink-500 italic px-3 py-2 border border-dashed border-paper-200 rounded-sm">
          Aucune opération
        </div>
        <button
          onClick={openCreate}
          className="w-full text-xs px-3 py-2 bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-2 justify-center"
        >
          <Plus size={13} /> {isLogged ? "Créer une opération" : "Se connecter pour créer"}
        </button>
        {modal && <Modal title={modal === "create" ? "Nouvelle opération" : "Modifier l'opération"} form={form} setForm={setForm} save={save} close={() => setModal(null)} err={err} saving={saving} />}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 text-sm rounded-sm bg-white border border-paper-200 hover:border-brand-500 transition text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-ink-900 truncate">{active.nom}</div>
            <div className="text-xs text-ink-500 mt-0.5 truncate">
              {active.commune} · {active.nb_logements_total} logts
            </div>
          </div>
          <ChevronDown size={14} className={`text-ink-500 shrink-0 transition ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-paper-200 rounded-sm shadow-lg z-40 max-h-96 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-500 border-b border-paper-200">
            Changer d'opération
          </div>
          {operations.map((op) => (
            <button
              key={op.id}
              onClick={() => { router.push(`/operations/${op.id}`); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-paper-50 border-b border-paper-200 last:border-b-0 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink-900 truncate">{op.nom}</div>
                <div className="text-[10px] text-ink-500 truncate">{op.commune} · {op.nb_logements_total} logts</div>
              </div>
              {op.id === active.id && <Check size={12} className="text-ok-500 shrink-0" />}
            </button>
          ))}
          <div className="border-t border-paper-200 p-2 space-y-1 bg-paper-50/50">
            <button onClick={openCreate} className="w-full px-2 py-1.5 text-xs bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-2 justify-center">
              <Plus size={11} /> Nouvelle opération
            </button>
            {isLogged && (
              <>
                <button onClick={openEdit} className="w-full px-2 py-1.5 text-xs border border-paper-200 bg-white text-ink-700 rounded-sm hover:bg-paper-100 flex items-center gap-2 justify-center">
                  <Pencil size={11} /> Modifier {active.nom.length > 20 ? "l'opération" : active.nom}
                </button>
                <button onClick={remove} className="w-full px-2 py-1.5 text-xs border border-paper-200 bg-white text-ink-500 hover:text-danger-500 rounded-sm hover:bg-paper-100 flex items-center gap-2 justify-center">
                  <Trash2 size={11} /> Supprimer
                </button>
              </>
            )}
            {!isLogged && (
              <div className="text-[10px] text-ink-500 italic text-center py-1">
                Connectez-vous pour modifier
              </div>
            )}
          </div>
        </div>
      )}

      {modal && <Modal title={modal === "create" ? "Nouvelle opération" : "Modifier l'opération"} form={form} setForm={setForm} save={save} close={() => setModal(null)} err={err} saving={saving} />}
    </div>
  );
}

function Modal({
  title, form, setForm, save, close, err, saving,
}: {
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  save: () => void;
  close: () => void;
  err: string | null;
  saving: boolean;
}) {
  const field = (label: string, k: keyof FormState, type: "number" | "text" = "text") => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-ink-500">{label}</span>
      <input
        type={type}
        value={form[k] as string | number}
        onChange={(e) => setForm({ ...form, [k]: type === "number" ? Number(e.target.value) || 0 : e.target.value })}
        className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm text-sm focus:border-brand-500 focus:outline-none"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 bg-ink-900/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-paper-200 flex items-center justify-between">
          <h2 className="font-serif text-lg text-ink-900">{title}</h2>
          <button onClick={close} className="text-ink-500 hover:text-ink-900 text-sm">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("Code (unique)", "code")}
            {field("Nom", "nom")}
            {field("Commune", "commune")}
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-500">Zone BRS</span>
              <select value={form.zone_brs} onChange={(e) => setForm({ ...form, zone_brs: e.target.value })} className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm text-sm bg-white">
                <option value="1">1 (Paris)</option>
                <option value="1bis">1bis (1ʳᵉ couronne IDF)</option>
                <option value="2">2 (Grandes agglos)</option>
                <option value="3">3 (Reste)</option>
              </select>
            </label>
            {field("Nb logements total", "nb_logements_total", "number")}
            {field("Nb logements BRS", "nb_logements_brs", "number")}
            {field("Nb logements PLI/Béguinage", "nb_logements_pli", "number")}
            {field("SHAB (m²)", "surface_habitable_m2", "number")}
            {field("Livraison cible", "livraison_cible")}
          </div>
          {err && <div className="rounded-sm border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs text-ink-700">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-paper-200 flex items-center justify-end gap-2">
          <button onClick={close} className="text-xs px-3 py-1.5 border border-ink-300 text-ink-700 rounded-sm hover:bg-paper-100">Annuler</button>
          <button onClick={save} disabled={saving || !form.code || !form.nom} className="text-xs px-4 py-1.5 bg-brand-500 text-white rounded-sm hover:bg-brand-700 disabled:opacity-50">
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
