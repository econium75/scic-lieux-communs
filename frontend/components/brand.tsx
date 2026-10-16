import { cn } from "@/lib/format";

/** Identité de l'outil : Téo (SCIC Lieux Communs). */
export const NOM_OUTIL = "Téo";

export function Brand({ taille = "normal" }: { taille?: "compact" | "normal" | "grand" }) {
  const carre = { compact: "h-7 w-7 text-base", normal: "h-10 w-10 text-xl", grand: "h-12 w-12 text-2xl" }[taille];
  return (
    <div className="flex items-center gap-3">
      <div className={cn("rounded-sm bg-brand-500 text-white flex items-center justify-center font-serif font-bold shrink-0", carre)} aria-hidden>
        T
      </div>
      <div className="leading-tight">
        <div className={cn("font-serif font-bold text-ink-900", taille === "compact" ? "text-sm" : "text-lg")}>{NOM_OUTIL}</div>
        {taille !== "compact" && <div className="text-[11px] tracking-wider text-ink-500 uppercase">SCIC</div>}
      </div>
    </div>
  );
}
