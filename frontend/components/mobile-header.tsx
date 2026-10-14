"use client";
import { useState, useEffect, Suspense } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Sliders, ArrowLeftRight, FileClock } from "lucide-react";
import { api } from "@/lib/api";
import type { Operation } from "@/lib/types";
import { SidebarOperation } from "@/components/sidebar-operation";
import { EquipeNav } from "@/components/equipe-nav";
import { Brand } from "@/components/brand";
import { AuthBadge } from "@/components/auth-badge";
import { NotificationsBell } from "@/components/notifications-bell";

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    api.listOperations().then(setOperations).catch(() => {});
  }, []);

  const refLinks = [
    { href: "/parametres", label: "Barèmes & paramètres", icon: Sliders },
    { href: "/donnees-exports", label: "Données & exports", icon: ArrowLeftRight },
    { href: "/audit", label: "Journal d'audit", icon: FileClock },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-paper-50 border-b border-paper-200 flex items-center justify-between px-4 z-30 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="p-2 -ml-2 rounded-sm hover:bg-paper-100 text-ink-700"
        >
          <Menu size={22} />
        </button>
        <Link href="/" aria-label="Téo — accueil">
          <Brand taille="compact" />
        </Link>
        <NotificationsBell variante="entete" />
      </header>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-ink-900/60 z-40 lg:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed inset-y-0 left-0 z-50 w-72 bg-paper-50 overflow-y-auto lg:hidden shadow-xl"
            onClick={(e) => {
              // Ferme le tiroir après un clic sur un lien (y compris un simple changement d'onglet ?onglet=…)
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-3 right-3 p-2 rounded-sm hover:bg-paper-100 text-ink-700 z-10"
            >
              <X size={20} />
            </button>

            <div className="px-5 py-6 flex flex-col gap-6 min-h-full">
              <Brand />

              <Suspense>
                <SidebarOperation operations={operations} />
              </Suspense>

              <EquipeNav />

              <nav className="flex flex-col gap-0.5">
                <div className="text-[10px] tracking-widest text-ink-500 uppercase font-medium mb-1">Référentiels</div>
                {refLinks.map((l) => (
                  <Link key={l.href} href={l.href} className="flex items-center gap-2.5 px-2 py-2 text-sm text-ink-700 rounded-sm hover:bg-paper-100">
                    <l.icon size={15} className="text-ink-500 shrink-0" />
                    <span>{l.label}</span>
                  </Link>
                ))}
              </nav>

              <div className="mt-auto border-t border-paper-200 pt-3 space-y-1">
                <AuthBadge />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
