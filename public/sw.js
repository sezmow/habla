// Offline support: the app shell and built assets are cached so lessons,
// reviews and progress (stored locally) keep working without a connection.
const CACHE = "habla-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./favicon.svg", "./manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  // Navigations: network first, fall back to the cached shell.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("./")));
    return;
  }
  // Hashed assets: cache first.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
