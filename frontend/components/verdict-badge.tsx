import type { Verdict } from "@/lib/types";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const cfg = {
    eligible: { label: "Éligible", bg: "bg-ok-50", border: "border-ok-500/40", text: "text-ok-500" },
    limite: { label: "Limite", bg: "bg-warn-50", border: "border-warn-500/40", text: "text-warn-500" },
    non_eligible: { label: "Non éligible", bg: "bg-danger-50", border: "border-danger-500/40", text: "text-danger-500" },
  }[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm border ${cfg.bg} ${cfg.border} ${cfg.text}`}
    >
      ● {cfg.label}
    </span>
  );
}
