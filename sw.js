const CACHE = "factupapa-v2026-04-12-uxfix";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if(event.data === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request){
  try{
    const response = await fetch(request, { cache:"no-store" });
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
    return response;
  }catch{
    const cached = await caches.match(request);
    if(cached) return cached;
    return caches.match("./index.html");
  }
}

async function staleWhileRevalidate(request){
  const cached = await caches.match(request);
  const network = fetch(request).then(async response => {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isDocument = event.request.mode === "navigate" || event.request.destination === "document";
  const isStaticAsset = isLocal && /(\.js|\.css|\.json|\.svg|\.webmanifest)$/i.test(url.pathname);
  const isCriticalShell = isLocal && (
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/sw.js")
  );
  if(isDocument || isCriticalShell || isStaticAsset){
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});
