const VERSION = "3.1.47";
const CACHE = `sistem-jadual-${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",

  "./styles.css?v=3.1.47",
  "./app.js?v=3.1.47",
  "./builder.js?v=3.1.47",
  "./builder.css?v=3.1.47",
  "./workspace.css?v=3.1.47",
  "./builder-relief.js?v=3.1.47",
  "./admin-api.js?v=3.1.47",
  "./site-config.js?v=3.1.47",
  "./public-ui.css?v=3.1.47",
  "./data.js?v=3.1.47",
  "./relief-engine.js?v=3.1.47",
  "./setting-slots.js?v=3.1.47",
  "./week-view.js?v=3.1.47",
  "./pdf-import.js?v=3.1.47",
  "./pdf-builder.js?v=3.1.47",
  "./teacher-transfer.js?v=3.1.47",
  "./teacher-coverage.js?v=3.1.47",
  "./relief-print.js?v=3.1.47",
  "./relief-pdf.js?v=3.1.47",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js",
  "./vendor/html2canvas-1.4.1.min.js",
  "./vendor/jspdf-3.0.4.umd.min.js"
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
