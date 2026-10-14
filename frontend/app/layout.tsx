import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { PWARegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Téo — SCIC",
  description: "Téo, l'outil de la SCIC Lieux Communs : montage financier des opérations, gestion de projet, tâches et documents.",
  manifest: "/manifest.json",
  applicationName: "Téo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Téo",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/icon.svg", color: "#1F3A68" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#1F3A68" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <PWARegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
