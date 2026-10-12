// Service Worker SCIC Lieux Communs — v2
// IMPORTANT : ne touche jamais aux requêtes /api/ (laisse le browser faire)
const CACHE_NAME = "scic-v2";
const PRECACHE = [
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. API : ne JAMAIS intercepter, laisser passer directement
  //    (sinon POST/PUT/DELETE peuvent se faire corrompre par la logique de cache)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 2. On ne cache que les GET
  if (event.request.method !== "GET") {
    return;
  }

  // 3. Navigation HTML : network-first, fallback cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // 4. Autres GET statiques : cache-first
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return res;
          })
          .catch(() => cached)
    )
  );
});
