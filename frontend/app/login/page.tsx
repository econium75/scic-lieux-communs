"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { LogIn } from "lucide-react";
import { Brand } from "@/components/brand";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(username, password);
      router.push("/");
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-paper-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <Brand taille="grand" />
        </div>

        <form onSubmit={submit} className="rounded-sm border border-paper-200 bg-white p-6 shadow-sm">
          <h1 className="font-serif text-xl text-ink-900 mb-4">Connexion</h1>
          <label className="block mb-3">
            <span className="text-[10px] uppercase tracking-widest text-ink-500">Identifiant</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full px-3 py-2 border border-paper-200 rounded-sm text-sm focus:border-brand-500 focus:outline-none"
              required
            />
          </label>
          <label className="block mb-4">
            <span className="text-[10px] uppercase tracking-widest text-ink-500">Mot de passe</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full px-3 py-2 border border-paper-200 rounded-sm text-sm focus:border-brand-500 focus:outline-none"
              required
            />
          </label>
          {err && (
            <div className="mb-4 text-xs text-danger-500 bg-danger-50 border border-danger-500/30 rounded-sm px-3 py-2">
              {err}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 text-white py-2 rounded-sm hover:bg-brand-700 flex items-center gap-2 justify-center text-sm disabled:opacity-50"
          >
            <LogIn size={14} /> {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <div className="mt-6 rounded-sm border border-paper-200 bg-paper-50 p-4 text-xs text-ink-500">
          <div className="font-medium text-ink-700 mb-2">Comptes de démonstration</div>
          <ul className="space-y-1 font-mono text-[11px]">
            <li>admin / admin123 — tous droits</li>
            <li>saisie / saisie123 — CRUD opérations, hypothèses, exports</li>
            <li>lecture / lecture123 — lecture seule + exports</li>
          </ul>
          <div className="mt-3 text-[10px] italic">
            À changer avant mise en production — gérés en DB table `user`.
          </div>
        </div>
      </div>
    </div>
  );
}
