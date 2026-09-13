const VERSION = "3.1.65";
const CACHE = `sistem-jadual-${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",

  "./styles.css?v=3.1.65",
  "./app.js?v=3.1.65",
  "./builder.js?v=3.1.65",
  "./builder.css?v=3.1.65",
  "./workspace.css?v=3.1.65",
  "./builder-relief.js?v=3.1.65",
  "./admin-api.js?v=3.1.65",
  "./site-config.js?v=3.1.65",
  "./public-ui.css?v=3.1.65",
  "./data.js?v=3.1.65",
  "./relief-engine.js?v=3.1.65",
  "./setting-slots.js?v=3.1.65",
  "./week-view.js?v=3.1.65",
  "./pdf-import.js?v=3.1.65",
  "./pdf-builder.js?v=3.1.65",
  "./teacher-transfer.js?v=3.1.65",
  "./teacher-coverage.js?v=3.1.65",
  "./relief-print.js?v=3.1.65",
  "./relief-pdf.js?v=3.1.65",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Pustaka eksport PDF (~2.3 MB) hanya admin perlukan. Ia diisi apabila aplikasi memberitahu SW
// (selepas log masuk pentadbir); ciri yang digunakan sebelum itu tetap dicache melalui pengendali
// fetch di bawah. Pelawat awam tidak pernah memuat turunnya.
const HEAVY_SHELL = ["./vendor/pdf.min.js","./vendor/pdf.worker.min.js","./vendor/html2canvas-1.4.1.min.js","./vendor/jspdf-3.0.4.umd.min.js"];

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
    // Menunggu rangkaian pada lawatan berulang bermakna ~0.8 s menunggu shell yang sudah ada pada
    // peranti. Sajikan salinan itu serta-merta dan segarkan di belakang; versi baharu tetap dikesan
    // kerana setiap aset bertanda ?v= dan index.html diambil semula pada setiap lawatan.
    event.respondWith(caches.match("./index.html").then((cached) => {
      const fresh = fetch(event.request).then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put("./index.html", copy)); }
        return response;
      }).catch(() => cached);
      return cached || fresh;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  })));
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  // Alat PDF hanya dimuatkan apabila pentadbir benar-benar menggunakan sistem: pelawat awam tidak
  // sepatutnya memuat turun 2.3 MB untuk setiap siaran baharu.
  if (event.data === "CACHE_HEAVY") caches.open(CACHE).then((cache) => cache.addAll(HEAVY_SHELL)).catch(() => {});
});
