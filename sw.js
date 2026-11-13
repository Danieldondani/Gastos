/* Service worker: guarda la app para que abra sin conexion. */
const CACHE = "cuentas-v10"; /* sube el numero (v2, v3...) cada vez que cambies archivos */
const ASSETS = ["./", "index.html", "style.css?v=10", "app.js?v=10", "manifest.json", "historial.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; /* fuentes de Google: las gestiona el navegador */
  /* primero red, y si falla la copia guardada */
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
