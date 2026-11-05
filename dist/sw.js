const CACHE_NAME = "finansys-v6";
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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
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
  // 1. Apenas requisições GET são cacheadas
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // 2. NUNCA intercepta requisições de desenvolvimento do Vite, API ou outros domínios
  if (
    !url.origin.startsWith(self.location.origin) ||
    url.port === "5173" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/")
  ) {
    return;
  }

  // 3. Fallback para SPA Navigation offline
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy).catch(() => {}));
          }
          return response;
        })
        .catch(async () => {
          const cachedNavigate = await caches.match(e.request);
          if (cachedNavigate) return cachedNavigate;
          const fallback = (await caches.match("/index.html")) || (await caches.match("/"));
          return fallback || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        })
    );
    return;
  }

  // 4. Stale-While-Revalidate seguro garantindo sempre uma Response válida
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, copy).catch(() => {});
            });
          }
          return response;
        })
        .catch(() => {
          if (cached) return cached;
          return new Response("", { status: 404 });
        });
    })
  );
});
