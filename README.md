# MJ Hair Salon Experience

High-end bilingual MJ Hair Salon website, online booking system, WhatsApp verification/notifications, and an installable staff operations PWA.

## Product routes

- `/` — public AR/EN salon experience and booking concierge
- `/staff` — private username/password app, available only in installed standalone mode
- `/staff/install/<private-token>?platform=android|ios|windows` — administration-only PWA installation gateway
- `/staff/setup` — protected first-time Mustafa account setup

The owner account can see every schedule, manage services and team availability, add staff breaks, and create/reset employee accounts. Employee accounts can only see their own customers and phone numbers, update their own availability, and block break periods. Passwords are PBKDF2-hashed; sessions use secure HTTP-only cookies.

Booking starts at 12:00 PM. BAHAA and M7M7 finish at 9:00 PM; the remaining specialists finish at 11:00 PM. A service is offered only when it can finish inside the selected employee's shift. General starts use a 30-minute grid; designated packages retain a 60-minute start grid without displaying an hourly-booking label. The calendar is a rolling 365-day view.

## Staff installation access

Set `STAFF_INSTALL_TOKEN` as a production secret and distribute only the platform-specific private installation links. The normal `/staff` browser route never shows login or installation controls; it directs employees to launch MJ from its installed icon. Android and Windows still require the operating system's install confirmation. iOS requires Safari → Share → Add to Home Screen → Open as Web App.

Connect the final HTTPS domain before installing devices, enabling push, or registering passkeys. All three are bound to the web origin; changing the hostname later requires reinstalling or re-enrolling devices. Rotate `STAFF_INSTALL_TOKEN` after the salon devices are installed.

## WhatsApp configuration

The runtime supports these environment variables:

- `STAFF_OWNER_EMAILS` (comma-separated owner emails; keep this out of the repository)
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_AUTH_TEMPLATE`
- `WHATSAPP_CUSTOMER_TEMPLATE`
- `WHATSAPP_OWNER_TEMPLATE`
- `WHATSAPP_STAFF_TEMPLATE` (falls back to the owner template)
- `WHATSAPP_GRAPH_VERSION` (optional; defaults to `v22.0`)

For local Cloudflare previews only, set `CLOUDFLARE_D1_DATABASE_ID` outside the
repository. Production Sites deployments use the managed `DB` binding from
`.openai/hosting.json` and do not need this identifier in source control.

`WHATSAPP_DEMO_OTP=true` is available only for controlled testing. Leave it unset in production: the booking API then refuses confirmation unless WhatsApp accepted the real OTP message, and it never exposes a fallback code to the customer.

Mustafa can save each employee's WhatsApp number while creating their account. Booking notifications are then sent to the assigned employee as well as the salon/owner.

## Push notification configuration

Create one VAPID key pair for the final production domain and configure:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (for example, a monitored `mailto:` address)

Booking confirmation attempts the first push immediately without blocking the customer response. The scheduled Worker retries and completes queued staff notifications every minute, while foreground PWA sync also drains a bounded retry as a fallback. Each staff device must still install the PWA, sign in, and grant notification permission through the in-app button. Verify the `push-cron-heartbeat` row in `app_migrations` after deployment to prove the scheduled trigger is running.

A device subscription never outlives its remembered staff session. Logout, session rejection, credential reset, or a VAPID key change detaches or replaces the local subscription before another account can use the device.

## Production hosting

This application targets ChatGPT Sites / Cloudflare Workers and requires the bindings declared in `.openai/hosting.json`:

- D1 bound as `DB` for bookings, accounts, sessions, schedules, and notification state
- R2 bound as `BUCKET` for employee profile images
- Worker scheduled trigger `* * * * *` for push retries
- HTTPS and outbound access to the Meta Graph API

The public website and staff PWA use the same APIs, D1 database, and R2 bucket. Do not upload the build as static files or deploy it to generic cPanel/Node hosting without first replacing the Cloudflare bindings and Worker runtime.

Catalog seeding, full-day breaks, and the largest supported booking are chunked below D1's 50-query Free-plan invocation limit and 100-bound-parameter query limit. The integration suite enforces both budgets while preserving atomic slot claims.

## Production launch checklist

1. Attach the final domain, select one canonical hostname, confirm SSL, and make the public site reachable without the Sites owner gate.
2. Keep `WHATSAPP_DEMO_OTP` unset; add the production Meta token, phone-number ID, and approved Arabic templates.
3. Apply every pending SQL file in `drizzle/` in order before first traffic. `drizzle/0006_fat_sleeper.sql` is adoption-safe: it preserves the existing MJ data, backfills names, creates only missing tables/indexes, and records `runtime-schema-2026-08-29-v1`. Then confirm D1, R2, VAPID, the minute cron heartbeat, and a backup/retention policy.
4. Confirm staff names, WhatsApp numbers, shifts, weekly days off, services, prices, durations, and whether multi-specialty packages run in parallel or sequentially.
5. Complete one real end-to-end booking on the final domain: WhatsApp OTP, database record, staff dashboard sync, client/team WhatsApp templates, and push while the app is closed.
6. Cancel that booking and confirm the same slot becomes available again; upload one profile image to verify R2.
7. Install and test from the final domain on Android, iPhone/iPad 16.4+, and the Windows reception computer; then register passkeys and grant notifications.
8. Rotate the private installer token and record the production owner recovery and incident contacts.

## Stack

Full-stack [vinext](https://github.com/cloudflare/vinext) application running on Cloudflare Workers. Cloudflare D1, R2, scheduled Workers, and Drizzle migrations are required production dependencies.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Project shape

- `app/` contains the website, booking APIs, and staff PWA routes.
- `.openai/hosting.json` declares the required Sites D1 and R2 bindings.
- `worker/index.ts` serves the application and drains the push outbox every minute.
- `db/schema.ts` and `drizzle/` define the production database schema and migrations.
- `vite.config.ts` mirrors the production bindings for local development.

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and verify the rendered development-preview metadata
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
