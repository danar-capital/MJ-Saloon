import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { productionConfig, prepareCloudflareDeploy } from "../scripts/prepare-cloudflare-deploy.mjs";
import { stripSitesIdentityHeaders } from "../lib/hosting-security.ts";

const environment = () => ({
  CLOUDFLARE_CUTOVER_READY: "true",
  CLOUDFLARE_WORKER_NAME: "mj-saloon",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  CLOUDFLARE_D1_DATABASE_ID: "11111111-2222-3333-4444-555555555555",
  CLOUDFLARE_R2_BUCKET_NAME: "mj-existing-images",
  CLOUDFLARE_PUBLIC_HOSTNAME: "salon.example.com",
  MJ_RELEASE_SHA: "b".repeat(40),
});
const artifact = () => ({
  name: "local-preview", main: "index.js", compatibility_date: "2026-08-29",
  assets: { directory: "../client", binding: "ASSETS" },
  no_bundle: true, rules: [{ type: "ESModule", globs: ["**/*.js"] }],
  vars: { WHATSAPP_DEMO_OTP: "true", EXISTING_FLAG: "keep" },
  services: [{ binding: "SELF", service: "local-preview" }, { binding: "OTHER", service: "other-worker" }],
});

test("Cloudflare deployment requires an explicit cutover gate", () => {
  assert.throws(() => productionConfig(artifact(), { ...environment(), CLOUDFLARE_CUTOVER_READY: "false" }, "/project"), /CUTOVER_READY/);
});
test("Cloudflare deployment rejects missing or malformed production resource identifiers", () => {
  for (const key of ["CLOUDFLARE_WORKER_NAME", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_R2_BUCKET_NAME", "CLOUDFLARE_PUBLIC_HOSTNAME", "MJ_RELEASE_SHA"]) {
    const env = environment(); delete env[key];
    assert.throws(() => productionConfig(artifact(), env, "/project"), new RegExp(key));
  }
  assert.throws(() => productionConfig(artifact(), { ...environment(), CLOUDFLARE_PUBLIC_HOSTNAME: "https://example.com/path" }, "/project"), /PUBLIC_HOSTNAME/);
  assert.throws(() => productionConfig(artifact(), { ...environment(), CLOUDFLARE_D1_DATABASE_ID: "new-database" }, "/project"), /DATABASE_ID/);
});
test("production configuration retains compiled modules and binds existing data, images and one scheduler", () => {
  const source = artifact();
  const config = productionConfig(source, environment(), "/project");
  assert.deepEqual(config.assets, source.assets);
  assert.deepEqual(config.rules, source.rules);
  assert.equal(config.no_bundle, true);
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.equal(config.d1_databases[0].database_id, environment().CLOUDFLARE_D1_DATABASE_ID);
  assert.equal(config.r2_buckets[0].binding, "BUCKET");
  assert.equal(config.images.binding, "IMAGES");
  assert.deepEqual(config.triggers.crons, ["* * * * *"]);
  assert.equal(config.vars.WHATSAPP_DEMO_OTP, "false");
  assert.equal(config.vars.MJ_HOSTING, "cloudflare");
  assert.equal(config.vars.EXISTING_FLAG, "keep");
  assert.equal(config.keep_vars, true);
  assert.equal(config.services[0].service, "mj-saloon");
  assert.equal(config.services[1].service, "other-worker");
  assert.equal(source.name, "local-preview");
  assert.equal(source.vars.WHATSAPP_DEMO_OTP, "true");
});
test("production exposes only the explicitly selected hostname mode", () => {
  const custom = productionConfig(artifact(), environment(), "/project");
  assert.equal(custom.workers_dev, false);
  assert.deepEqual(custom.routes, [{ pattern: "salon.example.com", custom_domain: true }]);
  const dev = productionConfig(artifact(), { ...environment(), CLOUDFLARE_PUBLIC_HOSTNAME: "mj-saloon.example.workers.dev" }, "/project");
  assert.equal(dev.workers_dev, true);
  assert.equal(dev.routes, undefined);
});
test("static-only builds cannot replace the full application", () => {
  assert.throws(() => productionConfig({}, environment(), "/project"), /Worker entry/);
});
test("direct Cloudflare requests cannot spoof Sites identity, but keep staff cookies and request bodies", async () => {
  const original = new Request("https://salon.example.com/api/staff/login", {
    method: "POST", body: "payload", headers: {
      "oai-authenticated-user-email": "owner@example.com", "x-oai-user-id": "spoof",
      "cookie": "mj_staff_session_v2=test", "origin": "https://salon.example.com",
    },
  });
  const safe = stripSitesIdentityHeaders(original);
  assert.equal(safe.headers.has("oai-authenticated-user-email"), false);
  assert.equal(safe.headers.has("x-oai-user-id"), false);
  assert.equal(safe.headers.get("cookie"), "mj_staff_session_v2=test");
  assert.equal(safe.headers.get("origin"), "https://salon.example.com");
  assert.equal(await safe.text(), "payload");
  assert.equal(original.headers.get("oai-authenticated-user-email"), "owner@example.com");
});
test("preparation follows Vite's redirect and preserves relative module paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "mj-cf-test-"));
  try {
    await mkdir(join(root, ".wrangler/deploy"), { recursive: true });
    await mkdir(join(root, "dist/server"), { recursive: true });
    await mkdir(join(root, "dist/client"), { recursive: true });
    await writeFile(join(root, ".wrangler/deploy/config.json"), JSON.stringify({ configPath: "../../dist/server/wrangler.json" }));
    await writeFile(join(root, "dist/server/wrangler.json"), JSON.stringify(artifact()));
    await writeFile(join(root, "dist/server/index.js"), "export default {};");
    const output = await prepareCloudflareDeploy(root, environment());
    assert.equal(output, resolve(root, "dist/server/wrangler.production.json"));
    const saved = JSON.parse(await readFile(output, "utf8"));
    assert.equal(saved.main, "index.js");
    assert.equal(saved.assets.directory, "../client");
    assert.equal(saved.d1_databases[0].migrations_dir, join(root, "drizzle"));
    const redirect = JSON.parse(await readFile(join(root, ".wrangler/deploy/config.json"), "utf8"));
    assert.equal(redirect.configPath, "../../dist/server/wrangler.production.json");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("preparation refuses paths outside the built artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "mj-cf-test-"));
  try {
    await mkdir(join(root, ".wrangler/deploy"), { recursive: true });
    await writeFile(join(root, ".wrangler/deploy/config.json"), JSON.stringify({ configPath: "../../outside.json" }));
    await assert.rejects(prepareCloudflareDeploy(root, environment()), /outside dist/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
