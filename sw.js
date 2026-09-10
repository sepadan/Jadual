const VERSION = "3.0.9";
const CACHE = `sistem-jadual-${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",

  "./styles.css?v=3.0.9",
  "./app.js?v=3.0.9",
  "./builder.js?v=3.0.9",
  "./builder.css?v=3.0.9",
  "./workspace.css?v=3.0.9",
  "./builder-relief.js?v=3.0.9",
  "./admin-api.js?v=3.0.9",
  "./site-config.js?v=3.0.9",
  "./public-ui.css?v=3.0.9",
  "./data.js?v=3.0.9",
  "./relief-engine.js?v=3.0.9",
  "./pdf-import.js?v=3.0.9",
  "./pdf-builder.js?v=3.0.9",
  "./teacher-transfer.js?v=3.0.9",
  "./relief-print.js?v=3.0.9",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith("relief-skpr-") || key.startsWith("sistem-jadual-")) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  })));
});

self.addEventListener("message", (event) => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });
