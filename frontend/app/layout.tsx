import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "SCIC Lieux Communs — Simulateur",
  description: "Simulation financière multi-scénarios pour opérations BRS/PLS/PLI (habitat partagé & béguinage).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-screen flex">
        {/* @ts-expect-error async server component */}
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </body>
    </html>
  );
}
