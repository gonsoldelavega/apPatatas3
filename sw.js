const CACHE_VERSION = "2026-07-04a-solred";
const CACHE = `factupapa-${CACHE_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

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
    if(response.ok){
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
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
    if(response.ok){
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isApiRequest = isLocal && url.pathname.startsWith("/api/");
  const isSupabaseRequest = /(^|\.)supabase\.co$/i.test(url.hostname) || url.hostname.includes("supabase");
  const isDocument = event.request.mode === "navigate" || event.request.destination === "document";
  const isStaticAsset = isLocal && /(\.js|\.css|\.json|\.svg|\.png|\.jpg|\.jpeg|\.webmanifest)$/i.test(url.pathname);
  const isCriticalShell = isLocal && (
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/sw.js")
  );
  if(isApiRequest || isSupabaseRequest){
    event.respondWith(fetch(event.request, { cache:"no-store" }));
    return;
  }
  if(isDocument || isCriticalShell || isStaticAsset){
    event.respondWith(networkFirst(event.request));
    return;
  }
  if(isLocal){
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});
