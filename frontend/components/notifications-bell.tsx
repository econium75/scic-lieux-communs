"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { fmtDateHeure } from "@/lib/dates";
import { cn } from "@/lib/format";
import { Bell, Check, CheckCheck } from "lucide-react";

type N = { id: number; at: string; type_notif: string; titre: string; message: string; lue: boolean; url_action: string | null; emise_par: string };

const COULEURS: Record<string, string> = {
  mention: "border-l-brand-500",
  validation: "border-l-ok-500",
  consultation: "border-l-brand-500",
  deadline: "border-l-danger-500",
  audit: "border-l-ink-500",
  info: "border-l-paper-200",
};

/**
 * Cloche de notifications.
 * - variante « menu » : ligne de la barre latérale, panneau ouvert à droite ;
 * - variante « entete » : icône de l'en-tête mobile, panneau déroulé sous l'icône.
 */
export function NotificationsBell({ variante = "menu" }: { variante?: "menu" | "entete" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [connecte, setConnecte] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const reload = async () => {
    const ok = !!getUser();
    setConnecte(ok);
    if (!ok) return;
    try {
      const r = await api.listNotifications(false, 30);
      setRows(r.rows);
      setUnread(r.unread_count);
    } catch {}
  };

  useEffect(() => {
    reload();
    const i = setInterval(reload, 30000);
    const onChange = () => reload();
    window.addEventListener("scic:auth-change", onChange);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => {
      clearInterval(i);
      window.removeEventListener("scic:auth-change", onChange);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  if (!connecte) return variante === "entete" ? <div className="w-8" /> : null;

  const markOne = async (id: number) => {
    await api.markNotifRead(id).catch(() => {});
    reload();
  };
  const markAll = async () => {
    await api.markAllNotifRead().catch(() => {});
    reload();
  };
  const ouvrir = (n: N) => {
    if (!n.lue) markOne(n.id);
    setOpen(false);
    if (n.url_action) router.push(n.url_action);
  };

  const pastille = unread > 0 && (
    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-danger-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
      {unread > 9 ? "9+" : unread}
    </span>
  );

  return (
    <div ref={ref} className="relative">
      {variante === "entete" ? (
        <button onClick={() => { setOpen(!open); if (!open) reload(); }} aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`} className="relative p-2 -mr-2 rounded-sm hover:bg-paper-100 text-ink-700">
          <Bell size={20} />
          {pastille}
        </button>
      ) : (
        <button onClick={() => { setOpen(!open); if (!open) reload(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-ink-700 rounded-sm hover:bg-paper-100">
          <div className="relative">
            <Bell size={13} className="text-ink-500" />
            {pastille}
          </div>
          <span>Notifications</span>
          {unread > 0 && <span className="ml-auto text-[10px] text-danger-500 font-medium">{unread} non lue{unread > 1 ? "s" : ""}</span>}
        </button>
      )}

      {open && (
        <div
          className={cn(
            "absolute bg-white border border-paper-200 rounded-sm shadow-lg z-50 max-h-[70vh] flex flex-col",
            variante === "entete" ? "right-0 top-full mt-2 w-[min(22rem,calc(100vw-1.5rem))]" : "left-full ml-2 bottom-0 w-80"
          )}
        >
          <div className="px-3 py-2 border-b border-paper-200 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-ink-500 font-medium">Notifications</div>
            {unread > 0 && (
              <button onClick={markAll} className="text-[10px] text-brand-500 hover:underline flex items-center gap-1">
                <CheckCheck size={11} /> Tout marquer lu
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {rows.length === 0 && <div className="p-4 text-center text-xs text-ink-500 italic">Aucune notification.</div>}
            {rows.map((n) => (
              <div
                key={n.id}
                className={cn("border-l-4 border-b border-paper-200 px-3 py-2 hover:bg-paper-50/80", COULEURS[n.type_notif] || "border-l-paper-200", n.lue ? "bg-white" : "bg-brand-50/40")}
              >
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => ouvrir(n)} className="flex-1 min-w-0 text-left" disabled={!n.url_action && n.lue}>
                    <div className={cn("text-xs text-ink-900", !n.lue && "font-semibold")}>{n.titre}</div>
                    {n.message && <div className="text-[11px] text-ink-700 mt-0.5">{n.message}</div>}
                    <div className="text-[10px] text-ink-500 mt-1">
                      {n.emise_par === "system" ? "rappel automatique" : `par ${n.emise_par}`} · {fmtDateHeure(n.at)}
                      {n.url_action && <span className="text-brand-500 ml-1">· ouvrir →</span>}
                    </div>
                  </button>
                  {!n.lue && (
                    <button onClick={() => markOne(n.id)} className="text-ink-500 hover:text-ok-500" title="Marquer comme lue" aria-label="Marquer comme lue">
                      <Check size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
