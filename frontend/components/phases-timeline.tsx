"use client";
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { CheckCircle2, Circle, Clock, AlertCircle, Plus, LogIn } from "lucide-react";

type P = { id: number; operation_id: number; ordre: number; nom: string; statut: string; date_cible: string | null; date_realisation: string | null; responsable: string; notes: string };

const STATUT_CONFIG: Record<string, { icon: typeof Circle; color: string; bg: string; label: string }> = {
  a_faire: { icon: Circle, color: "text-ink-500", bg: "bg-paper-100", label: "À faire" },
  en_cours: { icon: Clock, color: "text-warn-500", bg: "bg-warn-50", label: "En cours" },
  termine: { icon: CheckCircle2, color: "text-ok-500", bg: "bg-ok-50", label: "Terminé" },
  bloque: { icon: AlertCircle, color: "text-danger-500", bg: "bg-danger-50", label: "Bloqué" },
};

export function PhasesTimeline({ operationId }: { operationId: number }) {
  const router = useRouter();
  const [phases, setPhases] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [, start] = useTransition();
  const isLogged = mounted && !!getUser();

  const reload = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.listPhases(operationId);
      setPhases(r);
    } catch (e) {
      setErr(String(e));
    } finally { setLoading(false); }
  };
  useEffect(() => {
    setMounted(true);
    reload();
    /* eslint-disable-next-line */
  }, [operationId]);

  const initDefault = () => {
    setErr(null);
    if (!isLogged) {
      router.push("/login");
      return;
    }
    start(async () => {
      try {
        await api.initPhases(operationId);
        await reload();
      } catch (e) {
        const msg = String(e);
        if (msg.includes("401")) {
          setErr("Session expirée. Reconnecte-toi pour initialiser les phases.");
        } else if (msg.includes("400") && msg.includes("existe")) {
          // Déjà initialisé — on reload
          await reload();
        } else if (msg.includes("403")) {
          setErr("Ton rôle ne permet pas d'initialiser les phases (admin ou saisie requis).");
        } else {
          setErr(`Erreur : ${msg}`);
        }
      }
    });
  };

  const changeStatus = (p: P, newStatus: string) => {
    setErr(null);
    if (!isLogged) {
      router.push("/login");
      return;
    }
    start(async () => {
      try {
        await api.updatePhase(p.id, {
          statut: newStatus,
          date_realisation: newStatus === "termine" ? new Date().toISOString() : null,
        });
        await reload();
      } catch (e) {
        setErr(String(e));
      }
    });
  };

  if (loading) return <div className="text-xs text-ink-500 italic">Chargement des phases…</div>;

  if (phases.length === 0) {
    return (
      <div className="rounded-sm border border-paper-200 bg-paper-50 p-4 text-center">
        <p className="text-sm text-ink-500 mb-2">Aucune phase définie pour cette opération.</p>
        {isLogged ? (
          <button
            onClick={initDefault}
            className="text-xs px-3 py-1.5 bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-2 mx-auto"
          >
            <Plus size={12} /> Initialiser les 8 phases standard
          </button>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="text-xs px-3 py-1.5 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-2 mx-auto"
          >
            <LogIn size={12} /> Se connecter pour initialiser les phases
          </button>
        )}
        {err && (
          <div className="mt-3 text-xs text-danger-500 bg-danger-50 border border-danger-500/30 rounded-sm px-3 py-2 text-left max-w-md mx-auto">
            {err}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-widest text-ink-500">Suivi de l'opération</div>
        <div className="text-[11px] text-ink-500">
          {phases.filter((p) => p.statut === "termine").length} / {phases.length} phases terminées
        </div>
      </div>
      <div className="relative">
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-paper-200 z-0" />
        <div className="relative grid grid-cols-4 md:grid-cols-8 gap-1 z-10">
          {phases.map((p) => {
            const cfg = STATUT_CONFIG[p.statut] || STATUT_CONFIG.a_faire;
            const Icon = cfg.icon;
            return (
              <div key={p.id} className="flex flex-col items-center group">
                <div className={`h-8 w-8 rounded-full ${cfg.bg} border-2 border-paper-200 flex items-center justify-center ${cfg.color}`}>
                  <Icon size={16} />
                </div>
                <div className="text-[11px] text-ink-700 text-center mt-1 h-8 leading-tight">{p.nom}</div>
                {isLogged && (
                  <select
                    value={p.statut}
                    onChange={(e) => changeStatus(p, e.target.value)}
                    className="text-[10px] mt-1 border border-paper-200 rounded-sm px-1 py-0.5 bg-white opacity-0 group-hover:opacity-100 transition"
                  >
                    <option value="a_faire">À faire</option>
                    <option value="en_cours">En cours</option>
                    <option value="termine">Terminé</option>
                    <option value="bloque">Bloqué</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {err && (
        <div className="mt-3 text-xs text-danger-500 bg-danger-50 border border-danger-500/30 rounded-sm px-3 py-2">
          {err}
        </div>
      )}
    </div>
  );
}
