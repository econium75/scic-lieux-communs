"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Users, GitBranch, Upload, GanttChartSquare, KanbanSquare, Milestone } from "lucide-react";
import { ONGLETS } from "@/lib/simulateur";
import { cn } from "@/lib/format";
import type { Operation } from "@/lib/types";

/** Opération affichée : celle de l'URL, sinon la première de la liste. */
export function useActiveOperationId(operations: Operation[]): number | undefined {
  const pathname = usePathname();
  const m = pathname.match(/\/operations\/(\d+)/);
  return m ? Number(m[1]) : operations[0]?.id;
}

export function OperationNav({ opId, compact = false }: { opId: number; compact?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ongletActif = pathname.endsWith("/simulateur") ? searchParams.get("onglet") || "hypotheses" : null;
  const vueProjet = pathname.endsWith("/projet") ? searchParams.get("vue") || "gantt" : null;
  const py = compact ? "py-1.5" : "py-2";

  const lien = (href: string, label: string, actif: boolean, icon?: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2 text-sm rounded-sm transition",
        py,
        actif ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-700 hover:bg-paper-100 hover:text-ink-900"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
  const titre = (t: string) => <div className="text-[11px] tracking-widest text-ink-500 uppercase font-medium mt-3 mb-1">{t}</div>;
  const ico = "text-ink-500 shrink-0";

  return (
    <nav className="flex flex-col gap-0.5">
      <div className="text-[11px] tracking-widest text-ink-500 uppercase font-medium mb-1">Opération</div>
      {lien(`/operations/${opId}`, "Tableau de bord", pathname === `/operations/${opId}`, <LayoutDashboard size={15} className={ico} />)}

      {titre("Montage financier")}
      {ONGLETS.map((o) =>
        lien(
          `/operations/${opId}/simulateur?onglet=${o.key}`,
          o.label,
          ongletActif === o.key,
          <span
            className={cn(
              "text-[11px] w-[15px] h-[15px] rounded-full inline-flex items-center justify-center shrink-0",
              ongletActif === o.key ? "bg-brand-500 text-white" : "bg-paper-200 text-ink-700"
            )}
          >
            {o.num}
          </span>
        )
      )}

      {titre("Suivi des opérations")}
      {lien(`/operations/${opId}/projet?vue=gantt`, "Diagramme de Gantt", vueProjet === "gantt", <GanttChartSquare size={15} className={ico} />)}
      {lien(`/operations/${opId}/projet?vue=tableau`, "Tableau des tâches", vueProjet === "tableau", <KanbanSquare size={15} className={ico} />)}
      {lien(`/operations/${opId}/projet?vue=phases`, "Suivi des phases", vueProjet === "phases", <Milestone size={15} className={ico} />)}

      {titre("Modules")}
      {lien(`/operations/${opId}/commercialisation`, "Commercialisation BRS", pathname.endsWith("/commercialisation"), <Users size={15} className={ico} />)}
      {lien(`/operations/${opId}/scenarios`, "Scénarios", pathname.includes("/scenarios"), <GitBranch size={15} className={ico} />)}
      {lien(`/operations/${opId}/imports`, "Imports", pathname.endsWith("/imports"), <Upload size={15} className={ico} />)}
    </nav>
  );
}
