"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { Bell, Check, CheckCheck } from "lucide-react";
import Link from "next/link";

type N = { id: number; at: string; type_notif: string; titre: string; message: string; lue: boolean; url_action: string | null; emise_par: string };

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const reload = async () => {
    if (!getUser()) return;
    try {
      const r = await api.listNotifications(false, 20);
      setRows(r.rows);
      setUnread(r.unread_count);
    } catch {}
  };

  useEffect(() => {
    setMounted(true);
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

  if (!mounted || !getUser()) return null;

  const markOne = async (id: number) => {
    await api.markNotifRead(id);
    reload();
  };
  const markAll = async () => {
    await api.markAllNotifRead();
    reload();
  };

  const typeColor: Record<string, string> = {
    mention: "border-l-brand-500",
    validation: "border-l-ok-500",
    consultation: "border-l-paper-200",
    deadline: "border-l-danger-500",
    audit: "border-l-ink-500",
    info: "border-l-paper-200",
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-ink-700 rounded-sm hover:bg-paper-100"
      >
        <div className="relative">
          <Bell size={13} className="text-ink-500" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-danger-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
        <span>Notifications</span>
        {unread > 0 && <span className="ml-auto text-[10px] text-danger-500 font-medium">{unread}</span>}
      </button>

      {open && (
        <div className="absolute left-full ml-2 bottom-0 w-80 bg-white border border-paper-200 rounded-sm shadow-lg z-50 max-h-96 flex flex-col">
          <div className="px-3 py-2 border-b border-paper-200 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-ink-500 font-medium">Notifications</div>
            {unread > 0 && (
              <button onClick={markAll} className="text-[10px] text-brand-500 hover:underline flex items-center gap-1">
                <CheckCheck size={11} /> Tout marquer lu
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {rows.length === 0 && (
              <div className="p-4 text-center text-xs text-ink-500 italic">Aucune notification.</div>
            )}
            {rows.map((n) => (
              <div
                key={n.id}
                className={`border-l-4 ${typeColor[n.type_notif] || "border-l-paper-200"} border-b border-paper-200 px-3 py-2 ${n.lue ? "bg-white" : "bg-brand-50/30"} hover:bg-paper-50/80`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-ink-900 font-medium">{n.titre}</div>
                    {n.message && <div className="text-[11px] text-ink-700 mt-0.5">{n.message}</div>}
                    <div className="text-[10px] text-ink-500 mt-1">
                      par {n.emise_par} · {new Date(n.at).toLocaleString("fr-FR")}
                    </div>
                    {n.url_action && (
                      <Link
                        href={n.url_action}
                        onClick={() => { markOne(n.id); setOpen(false); }}
                        className="text-[10px] text-brand-500 hover:underline"
                      >
                        Ouvrir →
                      </Link>
                    )}
                  </div>
                  {!n.lue && (
                    <button onClick={() => markOne(n.id)} className="text-ink-500 hover:text-ok-500" title="Marquer lu">
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
