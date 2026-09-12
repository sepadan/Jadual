const VERSION = "3.1.28";
const CACHE = `sistem-jadual-${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",

  "./styles.css?v=3.1.28",
  "./app.js?v=3.1.28",
  "./builder.js?v=3.1.28",
  "./builder.css?v=3.1.28",
  "./workspace.css?v=3.1.28",
  "./builder-relief.js?v=3.1.28",
  "./admin-api.js?v=3.1.28",
  "./site-config.js?v=3.1.28",
  "./public-ui.css?v=3.1.28",
  "./data.js?v=3.1.28",
  "./relief-engine.js?v=3.1.28",
  "./pdf-import.js?v=3.1.28",
  "./pdf-builder.js?v=3.1.28",
  "./teacher-transfer.js?v=3.1.28",
  "./teacher-coverage.js?v=3.1.28",
  "./relief-print.js?v=3.1.28",
  "./relief-pdf.js?v=3.1.28",
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
