import Link from "next/link";
import {
  LayoutDashboard,
  TableProperties,
  Receipt,
  Users,
  Scale,
  GitBranch,
  Sliders,
  ArrowLeftRight,
  Settings2,
  FileClock,
  Calendar,
  Mic,
  UserCog,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { AuthBadge } from "@/components/auth-badge";
import { NotificationsBell } from "@/components/notifications-bell";
import { OperationsSwitcher } from "@/components/operations-switcher";

export async function Sidebar({ activeOperationId }: { activeOperationId?: number }) {
  let operations: Awaited<ReturnType<typeof api.listOperations>> = [];
  try {
    operations = await api.listOperations();
  } catch {
    // backend offline — sidebar still renders
  }
  const active = operations.find((o) => o.id === activeOperationId) || operations[0];
  const opId = active?.id;

  const operationLinks = [
    { href: `/operations/${opId}`, label: "Synthèse", icon: LayoutDashboard },
    { href: `/operations/${opId}/bilan`, label: "Bilan d'opération", icon: TableProperties },
    { href: `/operations/${opId}/exploitation`, label: "Exploitation locative", icon: Receipt },
    { href: `/operations/${opId}/commercialisation`, label: "Commercialisation BRS", icon: Users },
    { href: `/operations/${opId}/bilan-exploitation`, label: "Bilan d'exploitation", icon: Scale },
    { href: `/operations/${opId}/scenarios`, label: "Scénarios", icon: GitBranch },
    { href: `/operations/${opId}/parametres`, label: "Hypothèses opération", icon: Settings2 },
    { href: `/operations/${opId}/imports`, label: "Imports", icon: Upload },
  ];
  const equipeLinks = [
    { href: "/agenda", label: "Agenda partagé", icon: Calendar },
    { href: "/briefing", label: "Briefing podcast", icon: Mic },
    { href: "/admin/users", label: "Utilisateurs", icon: UserCog },
  ];
  const referentielLinks = [
    { href: "/parametres", label: "Paramètres", icon: Sliders },
    { href: "/donnees-exports", label: "Données & exports", icon: ArrowLeftRight },
    { href: "/audit", label: "Journal d'audit", icon: FileClock },
  ];

  return (
    <aside className="w-64 shrink-0 border-r border-paper-200 bg-paper-50 min-h-screen px-5 py-6 flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-sm bg-brand-700 text-white flex items-center justify-center font-serif text-lg font-bold">
          LC
        </div>
        <div className="leading-tight">
          <div className="font-serif font-bold text-ink-900">Lieux Communs</div>
          <div className="text-[11px] tracking-wider text-ink-500 uppercase">Simulateur SCIC</div>
        </div>
      </div>

      <SectionTitle>Opération active</SectionTitle>
      <OperationsSwitcher activeOperationId={activeOperationId} />

      {opId && (
        <nav className="flex flex-col gap-0.5">
          <SectionTitle>Opération</SectionTitle>
          {operationLinks.map((link) => (
            <NavLink key={link.href} {...link} />
          ))}
        </nav>
      )}

      <nav className="flex flex-col gap-0.5">
        <SectionTitle>Équipe</SectionTitle>
        {equipeLinks.map((link) => (
          <NavLink key={link.href} {...link} />
        ))}
      </nav>

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
        <div className="text-[10px] text-ink-300 flex items-center justify-between">
          <span>v0.6 session 6</span>
          <span>Thème clair</span>
        </div>
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] tracking-widest text-ink-500 uppercase font-medium">
      {children}
    </div>
  );
}

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof LayoutDashboard }) {
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
