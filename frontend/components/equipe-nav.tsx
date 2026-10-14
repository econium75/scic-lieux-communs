"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, ClipboardList, FolderOpen, Mic, UserCog } from "lucide-react";
import { collab, type Compteurs } from "@/lib/collab";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";

/** Section « Équipe » du menu, avec le nombre de tâches à traiter (actualisé chaque minute). */
export function EquipeNav({ dense = false }: { dense?: boolean }) {
  const pathname = usePathname();
  const [c, setC] = useState<Compteurs | null>(null);

  useEffect(() => {
    const charger = () => {
      if (!getUser()) return setC(null);
      collab.compteurs().then(setC).catch(() => setC(null));
    };
    charger();
    const i = setInterval(charger, 60_000);
    window.addEventListener("scic:auth-change", charger);
    return () => {
      clearInterval(i);
      window.removeEventListener("scic:auth-change", charger);
    };
  }, [pathname]);

  const liens = [
    { href: "/taches", label: "Mes tâches", icon: ClipboardList, badge: c?.a_faire || 0, alerte: (c?.en_retard || 0) > 0 },
    { href: "/documents", label: "Porte-documents", icon: FolderOpen, badge: c?.a_signer || 0, alerte: false },
    { href: "/agenda", label: "Agenda partagé", icon: Calendar, badge: 0, alerte: false },
    { href: "/briefing", label: "Briefing podcast", icon: Mic, badge: 0, alerte: false },
    { href: "/admin/users", label: "Utilisateurs", icon: UserCog, badge: 0, alerte: false },
  ];

  return (
    <nav className="flex flex-col gap-0.5">
      <div className="text-[10px] tracking-widest text-ink-500 uppercase font-medium mb-1">Équipe</div>
      {liens.map((l) => {
        const actif = pathname === l.href || pathname.startsWith(`${l.href}/`);
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
                className={cn("text-[10px] min-w-[18px] h-[18px] px-1 rounded-full inline-flex items-center justify-center font-semibold", l.alerte ? "bg-danger-500 text-white" : "bg-brand-500 text-white")}
                title={l.href === "/documents" ? "Documents à signer" : l.alerte ? "Dont certaines en retard" : "Tâches à traiter"}
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
