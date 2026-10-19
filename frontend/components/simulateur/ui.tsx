"use client";
import { useEffect, useState } from "react";
import { cn, espacesLisibles } from "@/lib/format";

// ─── Formatage
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Évite les « -0 » à l'affichage (petits négatifs arrondis à zéro). */
function sansMoinsZero(v: number, decimals: number): number {
  return Math.abs(v) < 0.5 * 10 ** -decimals ? 0 : v;
}

export function eur(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const x = sansMoinsZero(v, decimals);
  const s = espacesLisibles(decimals ? nf2.format(x) : nf0.format(x));
  return `${s} €`;
}
export function num(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return espacesLisibles(
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(sansMoinsZero(v, decimals))
  );
}
export function pct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(decimals).replace(".", ",")} %`;
}

function parse(txt: string): number | null {
  const t = txt.replace(/[\s  €%]/g, "").replace(",", ".");
  if (t === "" || t === "-" || t === "." || t === "-.") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function display(v: number | null | undefined, decimals: number, grouping: boolean): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  return espacesLisibles(
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0,
      useGrouping: grouping,
    }).format(v)
  );
}

/**
 * Champ numérique tolérant (virgule ou point, espaces) : garde le texte saisi pendant la frappe.
 * scale = 100 pour saisir un pourcentage stocké en fraction (2 % → 0,02).
 * nullable : un champ vidé renvoie null (= valeur calculée automatiquement).
 */
export function NumInput({
  value,
  onChange,
  disabled = false,
  decimals = 2,
  scale = 1,
  nullable = false,
  placeholder,
  className,
  align = "right",
  suffix,
  ariaLabel,
  grouping = true,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  decimals?: number;
  scale?: number;
  nullable?: boolean;
  placeholder?: string;
  className?: string;
  align?: "left" | "right";
  suffix?: string;
  ariaLabel?: string;
  /** false pour les années (2029 et non « 2 029 ») */
  grouping?: boolean;
}) {
  const shown = value === null || value === undefined ? null : value * scale;
  const [txt, setTxt] = useState(display(shown, decimals, grouping));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setTxt(display(shown, decimals, grouping));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, focus]);

  return (
    <div className={cn("relative", className)}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        value={txt}
        placeholder={placeholder}
        onFocus={() => {
          setFocus(true);
          setTxt(display(shown, 6, false));
        }}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parse(e.target.value);
          if (n === null) {
            if (nullable && e.target.value.trim() === "") onChange(null);
            else if (e.target.value.trim() === "") onChange(0);
            return;
          }
          onChange(n / scale);
        }}
        className={cn(
          "w-full tabular-nums border rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-brand-500",
          align === "right" ? "text-right" : "text-left",
          suffix ? "pr-7" : "",
          disabled
            ? "bg-paper-50 border-transparent text-ink-700 cursor-not-allowed"
            : "bg-[#fffbea] border-paper-200 hover:border-ink-300"
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-500">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  type?: "text" | "date";
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full border rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-brand-500",
        disabled ? "bg-paper-50 border-transparent text-ink-700" : "bg-[#fffbea] border-paper-200 hover:border-ink-300",
        className
      )}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[] | { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  const opts = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full border rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-brand-500",
        disabled ? "bg-paper-50 border-transparent text-ink-700" : "bg-[#fffbea] border-paper-200",
        className
      )}
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-ink-700 mb-1 leading-tight">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-500 mt-0.5 leading-tight">{hint}</span>}
    </label>
  );
}

export function Section({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-sm border border-paper-200 bg-white mb-5", className)}>
      <div className="px-4 sm:px-5 py-3 border-b border-paper-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[11px] uppercase tracking-widest text-ink-700 font-semibold">{title}</h2>
          {subtitle && <div className="text-xs text-ink-500 mt-0.5">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = "secondary",
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  title?: string;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-brand-500 text-white hover:bg-brand-700 border border-brand-500",
    secondary: "bg-white text-ink-700 border border-paper-200 hover:border-ink-300 hover:bg-paper-50",
    ghost: "text-ink-500 hover:text-ink-900 hover:bg-paper-100 border border-transparent",
    danger: "text-ink-500 hover:text-danger-500 hover:bg-danger-50 border border-transparent",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-xs px-3 py-1.5 rounded-sm inline-flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed",
        styles
      )}
    >
      {children}
    </button>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const color = { default: "text-ink-900", ok: "text-ok-500", warn: "text-warn-500", danger: "text-danger-500" }[tone];
  return (
    <div className="rounded-sm bg-white border border-paper-200 p-4">
      <div className="text-[11px] uppercase tracking-widest text-ink-500 leading-tight">{label}</div>
      <div className={cn("font-serif text-xl sm:text-2xl mt-1.5 tabular-nums", color)}>{value}</div>
      {sub && <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function ReadOnlyBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-sm border border-paper-200 bg-paper-50 px-4 py-2 text-xs text-ink-700 flex items-center gap-2">
      <span aria-hidden>🔒</span>
      {children}
    </div>
  );
}

// Classes de tableau partagées
export const th = "px-3 py-2 text-[11px] uppercase tracking-widest text-ink-500 font-medium whitespace-nowrap";
export const td = "px-3 py-1.5 tabular-nums whitespace-nowrap";
export const tdNum = "px-3 py-1.5 tabular-nums text-right whitespace-nowrap";

/** Choix du périmètre des onglets 7 et 8 : avec ou sans les logements BRS. */
export function PerimetreSelect({ value, onChange, aDesBrs }: { value: "avec" | "sans"; onChange: (v: "avec" | "sans") => void; aDesBrs: boolean }) {
  if (!aDesBrs) return null;
  const opts = [
    { v: "avec" as const, l: "Avec BRS", aide: "Locatif et compte OFS des BRS consolidés" },
    { v: "sans" as const, l: "Sans BRS", aide: "Partie locative seule (PLAI, PLUS, PLS, PLI)" },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">Périmètre</span>
      <div role="group" aria-label="Périmètre du calcul" className="inline-flex rounded-sm border border-paper-200 bg-white p-0.5">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={value === o.v}
            title={o.aide}
            onClick={() => onChange(o.v)}
            className={cn("text-xs px-3 py-1.5 rounded-sm font-medium transition", value === o.v ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-paper-100")}
          >
            {o.l}
          </button>
        ))}
      </div>
      <span className="text-xs text-ink-500">{opts.find((o) => o.v === value)?.aide}</span>
    </div>
  );
}
