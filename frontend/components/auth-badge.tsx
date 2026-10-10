"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, clearAuth, type AuthUser } from "@/lib/auth";
import { LogIn, LogOut, UserCircle } from "lucide-react";

export function AuthBadge() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUser(getUser());
    const onChange = () => setUser(getUser());
    window.addEventListener("scic:auth-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("scic:auth-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  if (!mounted) return null;

  if (!user) {
    return (
      <button
        onClick={() => router.push("/login")}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-ink-700 rounded-sm hover:bg-paper-100"
      >
        <LogIn size={13} className="text-ink-500" />
        <span>Se connecter</span>
      </button>
    );
  }

  const roleColor = {
    admin: "bg-brand-50 text-brand-700 border-brand-500/30",
    saisie: "bg-ok-50 text-ok-500 border-ok-500/30",
    lecture: "bg-paper-100 text-ink-500 border-paper-200",
  }[user.role];

  const logout = () => {
    clearAuth();
    router.push("/login");
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2 py-1">
        <UserCircle size={16} className="text-ink-500" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-ink-900 font-medium truncate">{user.nom_affichage || user.username}</div>
          <div className="text-[10px] text-ink-500 truncate">{user.username}</div>
        </div>
        <span className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-sm border ${roleColor}`}>
          {user.role}
        </span>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-2 px-2 py-1 text-[11px] text-ink-500 hover:text-danger-500 hover:bg-paper-100 rounded-sm"
      >
        <LogOut size={11} />
        <span>Déconnexion</span>
      </button>
    </div>
  );
}
