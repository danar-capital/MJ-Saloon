const CACHE = "mj-team-v9";
const SHELL = [
  "/staff",
  "/manifest.webmanifest",
  "/assets/mj-control-192.png",
  "/assets/mj-control-512.png",
  "/assets/mj-notification-192.png",
  "/assets/mj-notification-badge.png",
];

async function cacheStaffShell(cache) {
  const response = await fetch("/staff", { cache: "no-store" });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put("/staff", response);
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/assets/")))
    .map((url) => url.href);
  await Promise.allSettled([...new Set(assetUrls)].map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.filter((url) => url !== "/staff").map((url) => cache.add(url)));
    await cacheStaffShell(cache).catch(() => undefined);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("mj-team-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.endsWith(".mp4")) return;

  if (request.mode === "navigate" && url.pathname === "/staff") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          event.waitUntil(cache.put("/staff", response.clone()));
        }
        return response;
      } catch {
        return await caches.match("/staff") ?? new Response("MJ Team is offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  const cacheable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest";
  if (!cacheable) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const update = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    });
    if (cached) {
      event.waitUntil(update.catch(() => undefined));
      return cached;
    }
    return update;
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "لديك تحديث جديد في MJ." };
  }
  const title = payload.title || "MJ Team";
  const options = {
    body: payload.body || "لديك حجز جديد.",
    icon: "/assets/mj-notification-192.png",
    badge: "/assets/mj-notification-badge.png",
    tag: payload.tag || "mj-booking",
    renotify: false,
    dir: "rtl",
    lang: "ar",
    data: { url: payload.url || "/staff", bookingId: payload.bookingId || null },
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => Promise.all(clients.map((client) => client.postMessage({ type: "MJ_BOOKING_UPDATED", bookingId: options.data.bookingId })))),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let requested = new URL("/staff", self.location.origin);
  try {
    const candidate = new URL(event.notification.data?.url || "/staff", self.location.origin);
    if (candidate.origin === self.location.origin && candidate.pathname.startsWith("/staff")) requested = candidate;
  } catch {}
  const target = requested.href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      const current = new URL(client.url);
      if (current.origin !== self.location.origin || !current.pathname.startsWith("/staff")) continue;
      if ("navigate" in client) await client.navigate(target);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
