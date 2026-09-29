import { appendFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const host = process.env.CLOUDFLARE_PUBLIC_HOSTNAME;
const sha = process.env.MJ_RELEASE_SHA;
if (!host || !sha) throw new Error("Public hostname and expected release SHA are required.");
const base = `https://${host}`;
let verified = false;
for (let attempt = 0; attempt < 6; attempt++) {
  try {
    const response = await fetch(`${base}/_meta/release?commit=${sha}`, { signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store" });
    if (response.ok) {
      const release = await response.json();
      verified = release.hosting === "cloudflare" && release.commit === sha;
    }
  } catch { /* DNS, TLS and edge propagation are bounded by the retry limit. */ }
  if (verified) break;
  if (attempt < 5) await delay(5000);
}
if (!verified) throw new Error("Cloudflare upload is not confirmed live at the selected hostname. Do not retire the previous hosting.");
for (const path of ["/", "/manifest.webmanifest", "/sw.js", "/api/booking/config"]) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error(`Live route ${path} returned HTTP ${response.status}.`);
  const body = await response.text();
  if (!body.trim()) throw new Error(`Live route ${path} returned an empty body.`);
  if (path === "/manifest.webmanifest" || path === "/api/booking/config") JSON.parse(body);
}
console.log(`Confirmed Cloudflare release ${sha} and public website/PWA routes.`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## Cloudflare: LIVE COMMIT VERIFIED\n\nCommit: \`${sha}\`. Hostname: \`${host}\`. Public route smoke tests passed. Real WhatsApp delivery, staff sign-in, R2 uploads and closed-app push still require the production acceptance check.\n`);
}
