"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun } from "lucide-react";
import { cn } from "@/lib/format";

/** Lien « Ma journée » en tête du menu. */
export function AccueilLien() {
  const actif = usePathname() === "/";
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2.5 px-2 py-2 text-sm rounded-sm transition border",
        actif ? "bg-brand-500 text-white border-brand-500" : "bg-white text-ink-900 border-paper-200 hover:border-brand-500"
      )}
    >
      <Sun size={15} className={cn("shrink-0", actif ? "text-white" : "text-warn-500")} />
      <span className="font-medium">Ma journée</span>
    </Link>
  );
}
