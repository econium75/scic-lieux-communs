"use client";
import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    (async () => {
      try {
        // 1. Désinscrire TOUS les service workers existants (dont les anciens cassés)
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          await r.unregister();
        }
        // 2. Vider tous les caches
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        // 3. On n'enregistre PAS de nouveau SW pour l'instant : l'app fonctionne
        //    comme une web app classique (toujours installable via le manifest).
        //    Cela évite tout risque d'interception de requêtes /api/.
      } catch {
        /* ignore */
      }
    })();
  }, []);
  return null;
}
