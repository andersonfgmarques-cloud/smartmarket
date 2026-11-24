const CACHE_PREFIX = "smartmarket-";
const CACHE_VERSION = "smartmarket-shell-v9";
const BASE_URL = new URL("./", self.registration.scope);
const MANIFEST_URL = new URL("manifest.webmanifest", BASE_URL);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Bypass the previous service worker cache while installing a new version.
    const refreshUrl = new URL(BASE_URL.href);
    refreshUrl.searchParams.set("sw-refresh", CACHE_VERSION);
    const pageResponse = await fetch(refreshUrl.href, { cache: "reload" });
    if (!pageResponse.ok) throw new Error("Não foi possível preparar o SmartMarket para uso offline.");

    const html = await pageResponse.clone().text();
    const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
      .map((match) => new URL(match[1], BASE_URL))
      .filter((url) => url.origin === self.location.origin && url.href.startsWith(BASE_URL.href))
      .map((url) => url.href);

    await cache.put(BASE_URL.href, pageResponse);
    await cache.addAll([MANIFEST_URL.href, ...assetPaths]);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.href.startsWith(BASE_URL.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match(BASE_URL.href)) ||
          new Response("SmartMarket indisponível offline. Conecte-se à internet e abra o aplicativo novamente.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
      }
    }

    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return new Response("Recurso ainda não disponível offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  })());
});
