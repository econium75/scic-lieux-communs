"use client";
import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const update = async () => {
      try {
        // Désinscrire les anciens SW cassés (v1) pour forcer la mise à jour
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          if (!r.active?.scriptURL.endsWith("/sw.js")) {
            await r.unregister();
          }
        }
        // Enregistrer la nouvelle version
        const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        reg.update();
      } catch { /* ignore */ }
    };

    if (document.readyState === "complete") update();
    else window.addEventListener("load", update);
  }, []);
  return null;
}
