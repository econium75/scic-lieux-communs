"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/format";

export function Modal({
  titre,
  onClose,
  children,
  pied,
  large = false,
}: {
  titre: string;
  onClose: () => void;
  children: React.ReactNode;
  pied?: React.ReactNode;
  large?: boolean;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-ink-900/60 flex items-end sm:items-center justify-center z-50 sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn("bg-white rounded-t-md sm:rounded-sm w-full max-h-[92vh] flex flex-col shadow-xl", large ? "sm:max-w-3xl" : "sm:max-w-xl")}
      >
        <div className="px-5 py-3 border-b border-paper-200 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink-900 truncate">{titre}</h2>
          <button onClick={onClose} className="p-1 text-ink-500 hover:text-ink-900" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {pied && <div className="px-5 py-3 border-t border-paper-200 flex flex-wrap items-center justify-end gap-2">{pied}</div>}
      </div>
    </div>
  );
}

export const champ =
  "w-full px-2.5 py-1.5 border border-paper-200 rounded-sm text-sm bg-white focus:outline-none focus:border-brand-500";
export const etiquette = "block text-[11px] text-ink-700 mb-1";
/** Même style que `champ`, sans largeur imposée (à compléter par w-20, w-40…). */
export const champCourt = champ.replace("w-full ", "");

export function Bouton({
  children,
  onClick,
  disabled,
  variante = "secondaire",
  type = "button",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variante?: "primaire" | "secondaire" | "succes" | "danger" | "discret";
  type?: "button" | "submit";
  title?: string;
}) {
  const s = {
    primaire: "bg-brand-500 text-white hover:bg-brand-700 border-brand-500",
    secondaire: "bg-white text-ink-700 border-paper-200 hover:border-ink-300 hover:bg-paper-50",
    succes: "bg-ok-500 text-white border-ok-500 hover:opacity-90",
    danger: "bg-white text-danger-500 border-danger-500/40 hover:bg-danger-50",
    discret: "text-ink-500 border-transparent hover:bg-paper-100 hover:text-ink-900",
  }[variante];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn("text-xs px-3 py-1.5 rounded-sm border inline-flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed", s)}
    >
      {children}
    </button>
  );
}
