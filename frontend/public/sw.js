// Téo (SCIC Faire Commun) — Service Worker AUTO-DESTRUCTEUR
// Cette version se désinstalle elle-même et supprime tous les caches.
// Objectif : éliminer définitivement les anciens SW qui corrompaient les requêtes /api/ (POST).
// On ne fait AUCune interception de fetch : le réseau fonctionne normalement.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Supprimer tous les caches
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        // ignore
      }
      // Se désinscrire
      try {
        await self.registration.unregister();
      } catch (e) {
        // ignore
      }
      // Recharger tous les clients pour repartir sur une page propre
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});

// Aucune interception de fetch : on laisse le navigateur gérer toutes les requêtes.
