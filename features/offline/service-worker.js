/* Only these public, versioned shell files enter Cache Storage. No private responses or RSC payloads. */
const SHELL_VERSION = __SHELL_VERSION__;
const SHELL_REVISION = "__SHELL_REVISION__";
const CACHE = `teren-shell-v${SHELL_VERSION}-${SHELL_REVISION}`;
const FILES = __SHELL_FILES__;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(
        FILES.map(
          (path) => new Request(path, { cache: "reload", credentials: "omit" }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("teren-shell-") && key !== CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "SHELL_STATUS") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const ready = (
        await Promise.all(FILES.map((file) => cache.match(file)))
      ).every(Boolean);
      event.ports[0]?.postMessage({
        version: SHELL_VERSION,
        revision: SHELL_REVISION,
        ready,
      });
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;
  if (FILES.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) => (await cache.match(url.pathname)) || fetch(request),
        ),
    );
    return;
  }
  // Other destinations, APIs, guest reports, photos, Auth and Next/RSC requests are never intercepted.
  if (
    request.mode === "navigate" &&
    (url.pathname === "/today" ||
      /^\/visits\/[0-9a-f-]{36}$/.test(url.pathname))
  ) {
    event.respondWith(
      (async () => {
        async function offlineResponse() {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match("/offline/v1/index.html")) ||
            new Response(
              "Offline prikaz nije dostupan. Povežite se i ponovo preuzmite posetu.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            )
          );
        }
        if (self.navigator.onLine === false) return offlineResponse();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          return await fetch(request, {
            cache: "no-store",
            signal: controller.signal,
          });
        } catch {
          return offlineResponse();
        } finally {
          clearTimeout(timer);
        }
      })(),
    );
  }
});
