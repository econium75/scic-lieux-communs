import { Clock } from "lucide-react";

export function Placeholder({
  title,
  session,
  description,
}: {
  title: string;
  session: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl rounded-sm border border-paper-200 bg-white p-8 mt-6">
      <div className="flex items-center gap-2 text-ink-500 text-xs uppercase tracking-widest">
        <Clock size={14} />
        <span>Prévu {session}</span>
      </div>
      <h2 className="font-serif text-2xl text-ink-900 mt-3">{title}</h2>
      <p className="text-ink-700 mt-4 text-sm leading-relaxed">{description}</p>
      <div className="mt-6 text-xs text-ink-500">
        Session 1 livre uniquement M2 Bilan d'opération. Les autres modules de la
        note de cadrage V2 (M1, M3, M4, M5, M6, M7) seront livrés dans les sessions
        suivantes selon le plan séquentiel.
      </div>
    </div>
  );
}
