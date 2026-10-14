import { couleurAvatar, STATUTS, type StatutProjet } from "@/lib/projet";
import { cn } from "@/lib/format";

export function Avatars({ users, noms = {}, max = 3, taille = 22 }: { users: string[]; noms?: Record<string, string>; max?: number; taille?: number }) {
  if (!users.length) return <span className="text-[11px] text-ink-300">—</span>;
  const vus = users.slice(0, max);
  return (
    <span className="inline-flex items-center -space-x-1.5" title={users.map((u) => noms[u] || u).join(", ")}>
      {vus.map((u) => {
        const nom = noms[u] || u;
        const init = nom.split(/\s+/).map((m) => m[0]).join("").slice(0, 2).toUpperCase();
        return (
          <span
            key={u}
            className="inline-flex items-center justify-center rounded-full text-white font-semibold ring-2 ring-white"
            style={{ width: taille, height: taille, fontSize: taille * 0.42, backgroundColor: couleurAvatar(u) }}
          >
            {init}
          </span>
        );
      })}
      {users.length > max && (
        <span className="inline-flex items-center justify-center rounded-full bg-paper-200 text-ink-700 ring-2 ring-white" style={{ width: taille, height: taille, fontSize: taille * 0.4 }}>
          +{users.length - max}
        </span>
      )}
    </span>
  );
}

export function StatutPoint({ statut, className }: { statut: StatutProjet; className?: string }) {
  const s = STATUTS[statut] || STATUTS.a_faire;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-ink-700 whitespace-nowrap", className)}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.plein }} />
      {s.l}
    </span>
  );
}
