import { Sidebar } from "@/components/sidebar";
import { MobileHeader } from "@/components/mobile-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <MobileHeader />
      {/* La colonne garde le fond sombre du menu sur toute la hauteur des pages longues */}
      <div className="rail-sombre hidden lg:block bg-paper-50 border-r border-paper-200">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
