"use client";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("SERVICE_WORKER_TIMEOUT")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function isMjWorker(registration: ServiceWorkerRegistration) {
  const script = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL ?? "";
  return script ? new URL(script).pathname === "/sw.js" : false;
}

export async function registerStaffServiceWorker(timeoutMs = 10_000) {
  if (!("serviceWorker" in navigator)) return null;
  const registrations = await withTimeout(navigator.serviceWorker.getRegistrations(), timeoutMs).catch(() => [] as ServiceWorkerRegistration[]);
  await Promise.all(registrations
    .filter((registration) => isMjWorker(registration) && new URL(registration.scope).pathname === "/")
    .map((registration) => registration.unregister().catch(() => false)));
  const registration = await withTimeout(navigator.serviceWorker.register("/sw.js", { scope: "/staff" }), timeoutMs);
  return withTimeout(navigator.serviceWorker.ready, timeoutMs).catch(() => registration);
}

export async function getStaffServiceWorker(timeoutMs = 10_000) {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await findStaffServiceWorker(timeoutMs);
  return existing ?? registerStaffServiceWorker(timeoutMs).catch(() => null);
}

export async function findStaffServiceWorker(timeoutMs = 3_000) {
  if (!("serviceWorker" in navigator)) return null;
  return await withTimeout(navigator.serviceWorker.getRegistration("/staff"), timeoutMs).catch(() => null) ?? null;
}
