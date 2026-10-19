import { cn } from "@/lib/format";
import { STATUT_FACTURE, type StatutFacture } from "@/lib/projets";

/** Statut d'une facture (brouillon, émise, payée, annulée) ou « en retard ». */
export function BadgeFacture({ s, retard }: { s: StatutFacture; retard?: boolean }) {
  const c = retard
    ? "bg-danger-50 text-danger-500 border-danger-500/40"
    : {
        brouillon: "bg-warn-50 text-warn-500 border-warn-500/40",
        emise: "bg-brand-50 text-brand-700 border-brand-500/30",
        payee: "bg-ok-50 text-ok-500 border-ok-500/40",
        annulee: "bg-paper-100 text-ink-500 border-paper-200",
      }[s];
  return <span className={cn("text-[11px] px-1.5 py-0.5 rounded-sm border font-medium whitespace-nowrap", c)}>{retard ? "En retard" : STATUT_FACTURE[s]}</span>;
}
