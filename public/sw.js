const CACHE_NAME = "finansys-v4";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/pwa-192.png",
  "/pwa-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // 1. O cache do navegador (CacheStorage) APENAS suporta requisições GET
  if (e.request.method !== "GET") return;

  // 2. Não intercepta chamadas para rotas de API (/api/*) ou domínios externos
  const url = new URL(e.request.url);
  if (!url.origin.startsWith(self.location.origin) || url.pathname.startsWith("/api/")) {
    return;
  }

  // 3. Estratégia Stale-While-Revalidate segura com tratamento de erro
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networked = fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, copy).catch(() => {
                // Previne 'Cache.put encountered a network error' silenciosamente
              });
            });
          }
          return response;
        })
        .catch(() => cached);

      return cached || networked;
    })
  );
});
