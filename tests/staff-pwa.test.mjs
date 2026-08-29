import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

async function pngSize(path) {
  const bytes = await readFile(new URL(path, root));
  assert.deepEqual([...bytes.subarray(1, 4)], [80, 78, 71], `${path} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("staff manifest is scoped to the staff app and exposes proper icon purposes", async () => {
  const manifest = JSON.parse(await text("public/manifest.webmanifest"));
  assert.equal(manifest.id, "/staff");
  assert.equal(manifest.start_url, "/staff?app=1");
  assert.equal(manifest.scope, "/staff");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.display_override, ["standalone"]);
  assert.equal(manifest.orientation, "any");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  assert.deepEqual(await pngSize("public/assets/mj-maskable-512.png"), { width: 512, height: 512 });
  assert.deepEqual(await pngSize("public/assets/mj-notification-192.png"), { width: 192, height: 192 });
  assert.deepEqual(await pngSize("public/assets/mj-notification-badge.png"), { width: 96, height: 96 });
});

test("service worker keeps staff navigation offline and handles branded booking pushes", async () => {
  const worker = await text("public/sw.js");
  const sender = await text("lib/push-server.ts");
  const booking = await text("lib/booking-server.ts");
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /mj-notification-192\.png/);
  assert.match(worker, /mj-notification-badge\.png/);
  assert.match(worker, /notificationclick/);
  assert.match(worker, /candidate\.origin === self\.location\.origin/);
  assert.match(worker, /current\.pathname !== "\/staff"/);
  assert.match(worker, /current\.searchParams\.get\("app"\) !== "1"/);
  assert.match(worker, /payload\.url \|\| "\/staff\?app=1"/);
  assert.match(worker, /url\.pathname === "\/staff"/);
  assert.doesNotMatch(worker, /request\.mode === "navigate" && url\.pathname\.startsWith\("\/staff"\)/);
  assert.match(booking, /url:\s*"\/staff\?app=1&tab=upcoming"/);
  assert.match(sender, /PUSH_OUTBOX_BATCH_SIZE = 3/);
  assert.match(sender, /PUSH_SUBSCRIPTIONS_PER_PASS = 2/);
  assert.match(sender, /PUSH_FAST_OUTBOX_BATCH_SIZE = 2/);
  assert.match(sender, /PUSH_FAST_SUBSCRIPTIONS_PER_PASS = 1/);
  assert.match(sender, /ORDER BY CASE staff_id/);
  assert.match(sender, /CASE WHEN spd\.id IS NULL THEN 0 ELSE 1 END/);
  assert.match(sender, /spd\.next_attempt_at <= \?/);
  assert.doesNotMatch(booking, /deliverStaffPushOutboxWithRetry\(id\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /pushsubscriptionchange/);
  assert.match(worker, /subscriptionUsesKey\(subscription, settings\.publicKey\)/);
  assert.match(worker, /await subscription\.unsubscribe\(\)/);
  assert.doesNotMatch(booking, /body:\s*`\$\{fullName\}/);
});

test("push outbox has a bounded scheduled retry consumer", async () => {
  const [workerEntry, dashboardRoute, subscriptionRoute, syncRoute, bookingServer] = await Promise.all([
    text("worker/index.ts"),
    text("app/api/staff/dashboard/route.ts"),
    text("app/api/staff/push/route.ts"),
    text("app/api/staff/sync/route.ts"),
    text("lib/booking-server.ts"),
  ]);
  const viteConfig = await text("vite.config.ts");
  assert.match(workerEntry, /scheduled\(/);
  assert.match(workerEntry, /drainStaffPushOutbox/);
  assert.match(workerEntry, /markPushCronHeartbeat/);
  assert.match(viteConfig, /crons:\s*\["\* \* \* \* \*"\]/);
  assert.doesNotMatch(dashboardRoute, /drainStaffPushOutbox/);
  assert.doesNotMatch(subscriptionRoute, /drainStaffPushOutbox/);
  assert.match(syncRoute, /outboxLimit:\s*1/);
  assert.match(syncRoute, /subscriptionLimit:\s*1/);
  assert.match(bookingServer, /bookingId:\s*id[\s\S]*finalize:\s*false/);
  assert.match(bookingServer, /staffPriority:\s*pushRecipients/);
  assert.match(bookingServer, /staffIds\[0\], "mustafa"/);
});

test("staff can verify a real server push and open account actions from the avatar", async () => {
  const [dashboard, pushTest] = await Promise.all([
    text("components/staff/StaffDashboard.tsx"),
    text("app/api/staff/push/test/route.ts"),
  ]);
  assert.match(dashboard, /mj-member-popover/);
  assert.match(dashboard, /معلوماتي/);
  assert.match(dashboard, /تسجيل الخروج/);
  assert.match(dashboard, /اختبار إشعار حقيقي الآن/);
  assert.match(pushTest, /sendStaffPushTest/);
  assert.match(pushTest, /assertSameOrigin/);
  assert.match(pushTest, /requireStaffSession/);
});

test("booking synchronization protects shared resources and supports operational status updates", async () => {
  const [booking, config, breaks, bookingStatus, dashboard, push] = await Promise.all([
    text("lib/booking-server.ts"),
    text("lib/booking-config.ts"),
    text("app/api/staff/breaks/route.ts"),
    text("app/api/staff/bookings/status/route.ts"),
    text("app/api/staff/dashboard/route.ts"),
    text("lib/push-server.ts"),
  ]);
  assert.match(config, /resources:\s*\[/);
  assert.match(booking, /INSERT INTO otp_redemptions/);
  assert.match(booking, /existingBookingResult/);
  assert.ok(booking.indexOf("allowRedeemed && challenge.verified_at") < booking.indexOf("challenge.expires_at < Date.now()"), "a confirmed booking must remain idempotent after OTP expiry");
  assert.match(booking, /INSERT INTO staff_time_claims/);
  assert.match(booking, /groupStart % BOOKING_RULES\.slotMinutes/);
  assert.match(booking, /now\.minutes \+ BOOKING_RULES\.leadMinutes/);
  assert.equal((booking.match(/scheduleLockStatements\(/g) ?? []).length, 1, "legacy schedule locks must not be inserted for new bookings");
  assert.match(booking, /"reception"/);
  assert.match(breaks, /staffTimeClaimStatements/);
  assert.match(bookingStatus, /INVALID_BOOKING_STATUS_TRANSITION/);
  assert.match(bookingStatus, /DELETE FROM staff_time_claims/);
  assert.match(bookingStatus, /DELETE FROM schedule_locks/);
  assert.match(dashboard, /viewer\.canViewAllBookings/);
  assert.match(push, /staff_push_deliveries/);
  assert.match(bookingStatus, /BOOKING_STATUS_TOO_EARLY/);
  assert.match(bookingStatus, /bookingStatusTimingAllowed/);
});

test("staff manifest is exposed only through the private installer", async () => {
  const rootLayout = await text("app/layout.tsx");
  const staffLayout = await text("app/staff/layout.tsx");
  const installLayout = await text("app/staff/install/[token]/layout.tsx");
  const installPage = await text("app/staff/install/[token]/page.tsx");
  const installServer = await text("lib/staff-install-server.ts");
  assert.doesNotMatch(rootLayout, /manifest\.webmanifest/);
  assert.doesNotMatch(staffLayout, /manifest\.webmanifest/);
  assert.match(installLayout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(installLayout, /appleWebApp/);
  assert.match(installLayout, /validStaffInstallToken/);
  assert.match(installPage, /validStaffInstallToken/);
  assert.match(installServer, /STAFF_INSTALL_TOKEN/);
});

test("browser access is blocked and install controls stay outside the employee app", async () => {
  const [portal, dashboard, installer] = await Promise.all([
    text("components/staff/StaffPortal.tsx"),
    text("components/staff/StaffDashboard.tsx"),
    text("components/staff/StaffInstaller.tsx"),
  ]);
  assert.match(portal, /display-mode: standalone/);
  assert.match(portal, /navigator as Navigator & \{ standalone\?: boolean \}/);
  assert.match(portal, /mj-browser-lock/);
  assert.match(portal, /تسجيل الدخول غير متاح من المتصفح/);
  assert.doesNotMatch(portal, /beforeinstallprompt/);
  assert.doesNotMatch(portal, /mj-install-login/);
  assert.doesNotMatch(dashboard, /تثبيت MJ كتطبيق/);
  assert.doesNotMatch(dashboard, /onInstall/);
  assert.match(installer, /beforeinstallprompt/);
  assert.match(installer, /window\.location\.replace\("\/staff"\)/);
});

test("staff login requires an explicit remember choice and temporary credentials are gated", async () => {
  const [portal, credentialsRoute, pushRoute, auth] = await Promise.all([
    text("components/staff/StaffPortal.tsx"),
    text("app/api/staff/credentials/route.ts"),
    text("app/api/staff/push/route.ts"),
    text("lib/staff-auth.ts"),
  ]);
  assert.match(portal, /useState\(false\)/);
  assert.match(portal, /mustChangeCredentials/);
  assert.match(portal, /REMEMBER_DEVICE_KEY/);
  assert.match(portal, /response\.status === 401[\s\S]*detachDevicePushSubscription\(\)[\s\S]*closeStaffSession\(pushEndpoint\)/);
  assert.match(portal, /startupCleanupRef\.current = cleanup;\s*void cleanup;/);
  assert.ok(portal.indexOf("setViewer(null);\n    setCredentials") < portal.lastIndexOf("const cleanup = (async () =>"), "logout must hide customer data before device cleanup");
  assert.match(pushRoute, /Math\.min\(Date\.now\(\) \+ PUSH_SUBSCRIPTION_LIFETIME_MS, viewer\.sessionExpiresAt\)/);
  assert.doesNotMatch(auth, /if \(row\?\.session_id\) await db\.prepare\("DELETE FROM staff_sessions WHERE id = \?"\)/);
  assert.match(credentialsRoute, /changeOwnStaffCredentials/);
  assert.match(credentialsRoute, /assertSameOrigin/);
});

test("reduced motion disables animation instead of creating a rapid infinite flash", async () => {
  const css = await text("app/globals.css");
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none\s*!important/);
});

test("mobile devices skip heavy WebGL effects and the probe releases its context", async () => {
  const page = await text("app/page.tsx");
  assert.match(page, /max-width: 720px/);
  assert.match(page, /pointer: coarse/);
  assert.match(page, /WEBGL_lose_context/);
  assert.equal((page.match(/shouldUseWebGlEffects\(\)/g) ?? []).length, 3);
});

test("staff startup and sync remain lightweight on slow connections", async () => {
  const [portal, sync, auth, dashboard, dashboardApi] = await Promise.all([
    text("components/staff/StaffPortal.tsx"),
    text("app/api/staff/sync/route.ts"),
    text("lib/staff-auth.ts"),
    text("components/staff/StaffDashboard.tsx"),
    text("app/api/staff/dashboard/route.ts"),
  ]);
  assert.match(portal, /startupCleanupRef/);
  assert.match(portal, /const pushEndpoint = await detachDevicePushSubscription\(\);\s*await closeStaffSession\(pushEndpoint\)/);
  assert.match(portal, /await startupCleanupRef\.current/);
  assert.doesNotMatch(portal, /fetch\("\/api\/staff\/push"/);
  assert.match(sync, /requireStaffSession\(request, false, false, false\)/);
  assert.match(auth, /if \(touchSession\)/);
  assert.match(dashboard, /new Map\(data\.bookings\.map/);
  assert.doesNotMatch(dashboard, /data\.bookings\.find/);
  assert.match(dashboard, /pushState === "enabled" \? 60_000 : 15_000/);
  assert.match(dashboard, /function rejectedStaffSession/);
  assert.match(dashboard, /viewer\.sessionExpiresAt - Date\.now\(\)/);
  assert.match(dashboard, /setData\(\{ staff: \[\], services: \[\], bookings: \[\], items: \[\], schedules: \[\] \}\)/);
  assert.match(dashboard, /void onLogout\(\)/);
  assert.match(dashboard, /upcomingLimit/);
  assert.match(dashboardApi, /LIMIT \?/);
  assert.match(dashboardApi, /upcomingHasMore/);
  assert.match(dashboardApi, /requestedStaffId/);
});
