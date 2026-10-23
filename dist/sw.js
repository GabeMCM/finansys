const CACHE_NAME = "finansys-v2";
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
  // Não intercepta chamadas para APIs externas como Banco Central (BCB)
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networked = fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networked;
    })
  );
});
