import { Suspense } from "react";
import Link from "next/link";
import { Sliders, ArrowLeftRight, FileClock } from "lucide-react";
import { api } from "@/lib/api";
import { AuthBadge } from "@/components/auth-badge";
import { EquipeNav } from "@/components/equipe-nav";
import { ProjetsNav } from "@/components/projets-nav";
import { Brand } from "@/components/brand";
import { AccueilLien } from "@/components/accueil-lien";
import { NotificationsBell } from "@/components/notifications-bell";
import { SidebarOperation } from "@/components/sidebar-operation";

export async function Sidebar() {
  let operations: Awaited<ReturnType<typeof api.listOperations>> = [];
  try {
    operations = await api.listOperations();
  } catch {
    // backend offline — sidebar still renders
  }

  const referentielLinks = [
    { href: "/parametres", label: "Barèmes & paramètres", icon: Sliders },
    { href: "/donnees-exports", label: "Données & exports", icon: ArrowLeftRight },
    { href: "/audit", label: "Journal d'audit", icon: FileClock },
  ];

  return (
    <aside className="rail-sombre w-64 shrink-0 bg-paper-50 min-h-screen px-5 py-6 flex flex-col gap-6">
      <Link href="/" aria-label="Téo — accueil">
        <Brand />
      </Link>

      <AccueilLien />

      <Suspense>
        <SidebarOperation operations={operations} />
      </Suspense>

      <ProjetsNav dense />

      <EquipeNav dense />

      <nav className="flex flex-col gap-0.5">
        <SectionTitle>Référentiels</SectionTitle>
        {referentielLinks.map((link) => (
          <NavLink key={link.href} {...link} />
        ))}
      </nav>

      <div className="mt-auto space-y-2">
        <div className="border-t border-paper-200 pt-3 space-y-1">
          <NotificationsBell />
          <AuthBadge />
        </div>
        <div className="text-[11px] text-ink-300 flex items-center justify-between">
          <span>Téo v1.1</span>
        </div>
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] tracking-widest text-ink-500 uppercase font-medium">{children}</div>;
}

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Sliders }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-ink-700 rounded-sm hover:bg-paper-100 hover:text-ink-900 transition"
    >
      <Icon size={15} className="text-ink-500 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
