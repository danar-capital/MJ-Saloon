# MJ — production source and Cloudflare cutover

Updated: 2026-09-29. Production source is `danar-capital/MJ-Saloon`, branch `main`.
The cleanup starts from `55cd11c7ddded39ab8ebbd33fe93c41983df88c1` and preserves
the website, booking system and staff PWA. The older diverged staff-operations
branch is not blindly merged over this newer application.

**A GitHub commit is not proof of a live deployment.** The active workflow is
`.github/workflows/cloudflare-production.yml`. Its run summary explicitly says
`NOT DEPLOYED` when credentials, resource identifiers or the cutover gate are
missing. `LIVE COMMIT VERIFIED` is emitted only after deployment and a matching
live commit response plus public-route smoke tests.

## What was retired

`android-demo-source.zip` and `build-android-demo-apk.yml` moved to
`archive/legacy-android-demo/`. The old workflow is outside the Actions directory
and cannot run. The archived ZIP is outside the served `public/` assets.

The actual PWA (`app/staff`, `components/staff`, `public/sw.js`, its manifest,
icons and APIs) is retained. Database migrations and tests are not junk and
remain intact. The `build/` directory contains an active source plugin; it is
not disposable generated output. Generated `dist/`, local credentials and tool
state remain ignored.

The existing `.openai/hosting.json`, Vite configuration and Sites build helpers
are retained because the verified build currently uses them and the previous
host must remain recoverable until the Cloudflare acceptance check succeeds.
They do not deploy Sites from the new GitHub workflow. No external Sites,
Netlify, GitHub Pages, Worker, DNS route, database or bucket is deleted by this
cleanup. Any old external hosting must be retired separately after cutover.

## Connect the existing Cloudflare resources

In GitHub repository Settings > Secrets and variables > Actions, add:

Secret:

- `CLOUDFLARE_API_TOKEN`: a scoped token for the intended account and Worker
  deployment. Store it as a secret; do not paste it into source, docs or chat.

Repository variables:

- `CLOUDFLARE_ACCOUNT_ID`: the intended Cloudflare account's 32-character ID.
- `CLOUDFLARE_WORKER_NAME`: the exact production Worker name.
- `CLOUDFLARE_D1_DATABASE_ID`: the UUID of the existing MJ database, or a
  separately verified migration of it. Never substitute an empty database.
- `CLOUDFLARE_R2_BUCKET_NAME`: the existing MJ images bucket, or its verified
  migration. No bucket is auto-created by the deployment script.
- `CLOUDFLARE_PUBLIC_HOSTNAME`: one final hostname, with no scheme or path.
  A custom hostname is attached as a Worker Custom Domain; a `workers.dev`
  hostname must exactly match the actual Worker/account subdomain.
- `CLOUDFLARE_CUTOVER_READY`: set to `true` only after the checklist below.

The account must support the app's D1, R2 and Images bindings. The token needs
appropriate Workers/asset/binding permissions; attaching a custom hostname may
also require the relevant zone permissions. Do not broaden permissions to
unrelated accounts or projects. The old managed Sites resources may belong to
a different account: resource identifiers alone do not transfer data or access.

## Cutover gate: complete before enabling deployment

1. Back up existing data and confirm the target D1 database contains the expected
   bookings, staff accounts and schema. Copy R2 images where an account migration
   is required. This workflow does not create resources, reset tables, seed a
   replacement database or automatically apply migrations to production.
2. Review pending SQL in `drizzle/` against the actual database migration history.
   Apply only genuinely pending/adoption-safe migrations after backup; do not
   replay every old SQL file against an existing database.
3. Configure the final Worker's production secrets listed in `README.md`:
   private install token, Meta/WhatsApp token and approved template settings,
   and the VAPID keys/subject. Keep WhatsApp demo OTP disabled. Existing dashboard
   variables are retained with `keep_vars`; the deployment explicitly forces
   `WHATSAPP_DEMO_OTP=false`. Do not transfer production credentials through Git.
4. Verify the owner's normal staff username/password works in the target data.
   The old ChatGPT-header-based bootstrap/setup is not trusted on a direct public
   Worker. Set up or recover the owner account through a trusted administrative
   channel before switching. Do not weaken this protection to make setup easier.
5. Confirm the final hostname and a reversible traffic switch. Coordinate the
   old/new cron ownership so only one production scheduler drains notifications.
   The Cloudflare artifact declares the existing once-per-minute trigger.
6. Set `CLOUDFLARE_CUTOVER_READY=true`, then run the workflow on `main` (Actions >
   Verify MJ and deploy to Cloudflare > Run workflow), or push the next commit.
   Only `main` can deploy. Pull requests run build/tests without production
   credentials. A build/test or deployment failure stops the workflow.

## What the workflow does

It installs `package-lock.json` with `npm ci`, runs the existing verified build
and all tests, follows Vite's generated `.wrangler/deploy/config.json`, and
creates a sibling `wrangler.production.json` inside ignored `dist/`. It retains
Vite's compiled module/asset layout instead of treating the app as static files.
The production config explicitly binds `DB`, `BUCKET` and `IMAGES`, identifies
the commit, disables demo OTP and selects the supplied hostname. It uses the
locked Wrangler version, first for a dry run and then for deployment.

Direct Cloudflare requests strip client-supplied `oai-*` / `x-oai-*` identity
headers before reaching app routes. Existing staff session cookies, request
bodies, origin checks and password-based login are preserved. The managed Sites
path is unchanged when `MJ_HOSTING` is absent.

`/_meta/release` on the Cloudflare target exposes only the deployed commit and
hosting mode, with no credentials or customer data. The workflow checks that
this commit matches its checkout, then checks the homepage, PWA manifest,
service worker and booking configuration. These smoke checks do not prove real
WhatsApp delivery, successful staff authentication, image upload or closed-app
push; those need the acceptance test below.

## Acceptance and retirement

Complete a real booking on the final hostname: OTP, saved booking, staff sync,
WhatsApp messages, push with the app closed, cancellation and slot release.
Verify an R2 profile upload and the `push-cron-heartbeat` migration marker.
Install/re-enroll devices on the final origin; existing browser installs,
passkeys and push subscriptions do not automatically move between hostnames.
Then retire the old external deployment and its scheduler without deleting data
or removing the last known-good recovery path. Record the verified live commit.

## Local/authorized deployment

Use Node 22 and the existing Linux build prerequisites. Configure the variables
above in the calling environment without committing a dotenv file:

```bash
npm ci --no-audit --no-fund
npm test
export MJ_RELEASE_SHA="$(git rev-parse HEAD)"
node scripts/prepare-cloudflare-deploy.mjs
./node_modules/.bin/wrangler deploy --dry-run
./node_modules/.bin/wrangler deploy
node scripts/verify-cloudflare-release.mjs
```

References: Cloudflare Wrangler configuration and generated configuration docs:
https://developers.cloudflare.com/workers/wrangler/configuration/
