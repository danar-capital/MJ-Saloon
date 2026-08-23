import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";

test("renders production metadata and a deferred hero video", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.doesNotMatch(html, /name=["']codex-preview["']/i);
  const heroVideo = html.match(/<video(?=[^>]*\bclass=["'][^"']*\bhero-video\b[^"']*["'])[^>]*>/i)?.[0] ?? "";
  assert.match(heroVideo, /\bpreload=["']metadata["']/i);
  assert.doesNotMatch(heroVideo, /\bsrc=/i);
});

test("keeps startup hero videos within the delivery budget", async () => {
  for (const relativePath of [
    "../public/assets/mj-salon-hero-1080.mp4",
    "../public/assets/mj-salon-hero-mobile-1080.mp4",
  ]) {
    const details = await stat(new URL(relativePath, import.meta.url));
    assert.ok(details.size > 0);
    assert.ok(details.size < 5_000_000, `${relativePath} exceeds the 5 MB startup budget`);
  }
});
