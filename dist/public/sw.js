const CACHE = "ia-juridico-v1";
const ASSETS = ["/assistente/", "/assistente/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Never cache API calls — always go to network
  if (url.pathname.startsWith("/api/") ||
      url.hostname.includes("openai.com") ||
      url.hostname.includes("anthropic.com") ||
      url.hostname.includes("perplexity.ai") ||
      url.hostname.includes("groq.com") ||
      url.hostname.includes("mistral.ai") ||
      url.hostname.includes("googleapis.com") ||
      url.hostname.includes("openrouter.ai")) {
    return;
  }

  // For navigation requests, serve cached index.html (app shell)
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/assistente/index.html"))
    );
    return;
  }

  // Stale-while-revalidate for assets
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fetchPromise = fetch(e.request).then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
