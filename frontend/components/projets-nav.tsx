"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, ListChecks, Receipt } from "lucide-react";
import { factures } from "@/lib/projets";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";

/** Section « Projets » du menu : suivi des projets et facturation (brouillons à émettre, factures en retard). */
export function ProjetsNav({ dense = false }: { dense?: boolean }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [badge, setBadge] = useState({ brouillons: 0, retard: 0 });

  useEffect(() => {
    const charger = () => {
      const u = getUser();
      setRole(u?.role ?? null);
      if (u && u.role !== "lecture") {
        factures
          .liste()
          .then((r) => setBadge({ brouillons: r.indicateurs.brouillons, retard: r.indicateurs.nb_en_retard }))
          .catch(() => setBadge({ brouillons: 0, retard: 0 }));
      }
    };
    charger();
    window.addEventListener("scic:auth-change", charger);
    return () => window.removeEventListener("scic:auth-change", charger);
  }, [pathname]);

  const liens = [
    { href: "/projets", label: "Suivi des projets", icon: Briefcase, badge: 0, alerte: false, titre: "" },
    { href: "/projets/plans-action", label: "Plans d'action", icon: ListChecks, badge: 0, alerte: false, titre: "" },
    ...(role && role !== "lecture"
      ? [{ href: "/facturation", label: "Facturation", icon: Receipt, badge: badge.retard || badge.brouillons, alerte: badge.retard > 0,
           titre: badge.retard ? "Factures en retard de paiement" : "Factures à émettre" }]
      : []),
  ];

  return (
    <nav className="flex flex-col gap-0.5">
      <div className="text-[11px] tracking-widest text-ink-500 uppercase font-medium mb-1">Projets</div>
      {liens.map((l) => {
        const actif = pathname === l.href || (pathname.startsWith(`${l.href}/`) && !(l.href === "/projets" && pathname.startsWith("/projets/plans-action")));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center gap-2.5 px-2 text-sm rounded-sm transition",
              dense ? "py-1.5" : "py-2",
              actif ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-700 hover:bg-paper-100 hover:text-ink-900"
            )}
          >
            <l.icon size={15} className="text-ink-500 shrink-0" />
            <span className="flex-1">{l.label}</span>
            {l.badge > 0 && (
              <span
                className={cn("text-[11px] min-w-[18px] h-[18px] px-1 rounded-full inline-flex items-center justify-center font-semibold", l.alerte ? "bg-danger-500 text-white" : "bg-brand-500 text-white")}
                title={l.titre}
              >
                {l.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
