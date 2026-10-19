import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { PWARegister } from "@/components/pwa-register";

// Police auto-hébergée par Next (aucun appel à Google depuis le navigateur des utilisateurs)
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Téo — Faire Commun",
  description: "Téo, l'outil de la SCIC Faire Commun : montage financier et suivi des opérations, suivi des projets, facturation, tâches et documents.",
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
    other: [{ rel: "mask-icon", url: "/icon.svg", color: "#121A2B" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#121A2B" },
    { media: "(prefers-color-scheme: dark)", color: "#121A2B" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={publicSans.variable}>
      <body className="min-h-screen">
        <PWARegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
