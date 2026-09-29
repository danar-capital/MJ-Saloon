import { readFile, writeFile, access } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

function required(env, name, pattern) {
  const value = env[name]?.trim();
  if (!value || (pattern && !pattern.test(value))) {
    throw new Error(`Missing or invalid ${name}. Use the existing MJ production resource; do not create an empty replacement.`);
  }
  return value;
}

export function productionConfig(built, env, projectRoot) {
  if (env.CLOUDFLARE_CUTOVER_READY !== "true") {
    throw new Error("CLOUDFLARE_CUTOVER_READY must be true after the data, secrets, owner login and old scheduler have been checked.");
  }
  const name = required(env, "CLOUDFLARE_WORKER_NAME", /^[a-z0-9][a-z0-9-]{0,62}$/);
  const account = required(env, "CLOUDFLARE_ACCOUNT_ID", /^[a-f0-9]{32}$/i);
  const database = required(env, "CLOUDFLARE_D1_DATABASE_ID", /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  const bucket = required(env, "CLOUDFLARE_R2_BUCKET_NAME", /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/);
  const hostname = required(env, "CLOUDFLARE_PUBLIC_HOSTNAME", /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
  const release = required(env, "MJ_RELEASE_SHA", /^[a-f0-9]{40}$/i);
  if (!built.main || !built.assets?.directory) {
    throw new Error("The build must contain a Worker entry and static assets. Static-only deployment is not supported.");
  }
  const config = structuredClone(built);
  const previousName = config.name;
  config.name = name;
  config.account_id = account;
  config.compatibility_flags = [...new Set([...(config.compatibility_flags ?? []), "nodejs_compat"])];
  config.compatibility_date ??= "2026-08-29";
  config.keep_vars = true;
  config.d1_databases = [{ binding: "DB", database_id: database, migrations_dir: resolve(projectRoot, "drizzle") }];
  config.r2_buckets = [{ binding: "BUCKET", bucket_name: bucket }];
  config.images = { binding: "IMAGES" };
  config.triggers = { crons: ["* * * * *"] };
  config.vars = { ...config.vars, MJ_HOSTING: "cloudflare", MJ_RELEASE_SHA: release, WHATSAPP_DEMO_OTP: "false" };
  // The public hostname is explicit: never guess an account subdomain or DNS route.
  delete config.route;
  delete config.routes;
  delete config.env;
  config.workers_dev = hostname.endsWith(".workers.dev");
  if (!config.workers_dev) config.routes = [{ pattern: hostname, custom_domain: true }];
  if (Array.isArray(config.services) && previousName) {
    config.services = config.services.map((binding) => binding.service === previousName ? { ...binding, service: name } : binding);
  }
  return config;
}

function requireInside(parent, child) {
  const path = relative(parent, child);
  if (path === ".." || path.startsWith("../") || isAbsolute(path)) {
    throw new Error("Refusing a generated artifact outside dist/.");
  }
}

export async function prepareCloudflareDeploy(root = process.cwd(), env = process.env) {
  const redirectPath = resolve(root, ".wrangler/deploy/config.json");
  const redirect = JSON.parse(await readFile(redirectPath, "utf8"));
  if (typeof redirect.configPath !== "string") throw new Error("Missing Vite-generated Worker configuration. Run npm test first.");
  const originalPath = resolve(dirname(redirectPath), redirect.configPath);
  requireInside(resolve(root, "dist"), originalPath);
  const built = JSON.parse(await readFile(originalPath, "utf8"));
  const config = productionConfig(built, env, root);
  for (const item of [config.main, config.assets.directory]) {
    const artifact = resolve(dirname(originalPath), item);
    requireInside(resolve(root, "dist"), artifact);
    await access(artifact);
  }
  // Keep this file beside the generated configuration so Vite's relative module
  // and asset paths remain correct. Preserve its bundling rules and module map.
  const output = resolve(dirname(originalPath), "wrangler.production.json");
  await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await writeFile(redirectPath, `${JSON.stringify({ configPath: relative(dirname(redirectPath), output).split("\\").join("/") })}\n`);
  console.log(`Prepared ${relative(root, output)}. No database migrations, resource creation or deployment was performed.`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareCloudflareDeploy().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
