const VERSION = "3.1.14";
const CACHE = `sistem-jadual-${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",

  "./styles.css?v=3.1.14",
  "./app.js?v=3.1.14",
  "./builder.js?v=3.1.14",
  "./builder.css?v=3.1.14",
  "./workspace.css?v=3.1.14",
  "./builder-relief.js?v=3.1.14",
  "./admin-api.js?v=3.1.14",
  "./site-config.js?v=3.1.14",
  "./public-ui.css?v=3.1.14",
  "./data.js?v=3.1.14",
  "./relief-engine.js?v=3.1.14",
  "./pdf-import.js?v=3.1.14",
  "./pdf-builder.js?v=3.1.14",
  "./teacher-transfer.js?v=3.1.14",
  "./teacher-coverage.js?v=3.1.14",
  "./relief-print.js?v=3.1.14",
  "./relief-pdf.js?v=3.1.14",
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
