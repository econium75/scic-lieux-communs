import { AlertTriangle, AlertOctagon, Check } from "lucide-react";
import type { Alerte } from "@/lib/types";

export function AlerteItem({ alerte }: { alerte: Alerte }) {
  const config = {
    critique: {
      icon: AlertOctagon,
      label: "CRITIQUE",
      bg: "bg-danger-50",
      border: "border-danger-500/30",
      text: "text-danger-500",
    },
    attention: {
      icon: AlertTriangle,
      label: "ATTENTION",
      bg: "bg-warn-50",
      border: "border-warn-500/30",
      text: "text-warn-500",
    },
    info: {
      icon: Check,
      label: "Conforme",
      bg: "bg-ok-50",
      border: "border-ok-500/30",
      text: "text-ok-500",
    },
  }[alerte.severity];

  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-paper-200 last:border-b-0 ${config.bg}/30`}>
      <Icon size={16} className={`${config.text} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-900 font-medium">{alerte.titre}</div>
        <div className="text-xs text-ink-500 mt-0.5">{alerte.detail}</div>
      </div>
      <div className={`text-[10px] font-bold tracking-widest ${config.text}`}>{config.label}</div>
    </div>
  );
}

export function AlerteCount({ alertes }: { alertes: Alerte[] }) {
  const crit = alertes.filter((a) => a.severity === "critique").length;
  const warn = alertes.filter((a) => a.severity === "attention").length;
  if (crit === 0 && warn === 0) return <span className="text-xs text-ok-500">Conforme</span>;
  return (
    <span className="text-xs text-danger-500">
      {crit > 0 && <>{crit} crit</>}
      {crit > 0 && warn > 0 && " · "}
      {warn > 0 && <span className="text-warn-500">{warn} warn</span>}
    </span>
  );
}
