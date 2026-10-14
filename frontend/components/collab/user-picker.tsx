"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { collab, type Membre } from "@/lib/collab";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";

const ROLES: Record<string, string> = { admin: "Administrateur", saisie: "Éditeur", lecture: "Lecteur" };

/** Sélection multiple d'utilisateurs (annuaire de l'application). */
export function UserPicker({
  value,
  onChange,
  exclureMoi = true,
  hauteur = "max-h-48",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  exclureMoi?: boolean;
  hauteur?: string;
}) {
  const [membres, setMembres] = useState<Membre[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    collab.annuaire().then(setMembres).catch((e) => setErr(String(e.message || e)));
  }, []);
  const moi = getUser()?.username;
  const liste = useMemo(
    () =>
      membres
        .filter((m) => !(exclureMoi && m.username === moi))
        .filter((m) => `${m.nom_affichage} ${m.username}`.toLowerCase().includes(q.toLowerCase())),
    [membres, q, moi, exclureMoi]
  );
  const toggle = (u: string) => onChange(value.includes(u) ? value.filter((x) => x !== u) : [...value, u]);

  return (
    <div className="border border-paper-200 rounded-sm">
      <div className="flex items-center gap-2 px-2 border-b border-paper-200">
        <Search size={13} className="text-ink-300" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un utilisateur…" className="w-full py-1.5 text-sm focus:outline-none" />
        {value.length > 0 && <span className="text-[11px] text-brand-500 whitespace-nowrap">{value.length} choisi{value.length > 1 ? "s" : ""}</span>}
      </div>
      {err && <div className="px-3 py-2 text-xs text-danger-500">{err}</div>}
      <ul className={cn("overflow-y-auto", hauteur)}>
        {liste.map((m) => {
          const actif = value.includes(m.username);
          return (
            <li key={m.username}>
              <button
                type="button"
                onClick={() => toggle(m.username)}
                className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-paper-50", actif && "bg-brand-50")}
              >
                <span className={cn("w-4 h-4 rounded-sm border flex items-center justify-center shrink-0", actif ? "bg-brand-500 border-brand-500 text-white" : "border-ink-300")}>
                  {actif && <Check size={11} />}
                </span>
                <span className="text-ink-900">{m.nom_affichage}</span>
                <span className="text-[11px] text-ink-500">@{m.username}</span>
                <span className="ml-auto text-[10px] text-ink-300">{ROLES[m.role] || m.role}</span>
              </button>
            </li>
          );
        })}
        {!err && liste.length === 0 && <li className="px-3 py-2 text-xs text-ink-500 italic">Aucun utilisateur.</li>}
      </ul>
    </div>
  );
}
