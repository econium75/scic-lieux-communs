import { cn } from "@/lib/format";
import { LIBELLES_REPONSE, LIBELLES_TYPE, type Tache, type TypeTache } from "@/lib/collab";

export const COULEUR_TYPE: Record<TypeTache, string> = {
  validation: "bg-ok-50 text-ok-500 border-ok-500/30",
  consultation: "bg-brand-50 text-brand-700 border-brand-500/30",
  signature: "bg-warn-50 text-warn-500 border-warn-500/30",
  autre: "bg-paper-100 text-ink-700 border-paper-200",
};

export function BadgeType({ type }: { type: TypeTache }) {
  return (
    <span className={cn("text-[10px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded-sm border whitespace-nowrap", COULEUR_TYPE[type])}>
      {LIBELLES_TYPE[type]}
    </span>
  );
}

export function BadgeStatut({ t }: { t: Pick<Tache, "statut" | "reponse" | "en_retard"> }) {
  if (t.statut === "a_faire")
    return (
      <span className={cn("text-[11px] px-1.5 py-0.5 rounded-sm whitespace-nowrap", t.en_retard ? "bg-danger-50 text-danger-500 font-medium" : "bg-paper-100 text-ink-700")}>
        {t.en_retard ? "En retard" : "À traiter"}
      </span>
    );
  if (t.statut === "annulee") return <span className="text-[11px] px-1.5 py-0.5 rounded-sm bg-paper-100 text-ink-500 line-through">Annulée</span>;
  const refus = t.statut === "refusee";
  return (
    <span className={cn("text-[11px] px-1.5 py-0.5 rounded-sm whitespace-nowrap font-medium", refus ? "bg-danger-50 text-danger-500" : "bg-ok-50 text-ok-500")}>
      {LIBELLES_REPONSE[t.reponse] || (refus ? "Refusée" : "Terminée")}
    </span>
  );
}
