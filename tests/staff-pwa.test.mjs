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
  assert.equal(manifest.start_url, "/staff");
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
  assert.match(worker, /current\.pathname\.startsWith\("\/staff"\)/);
  assert.match(worker, /payload\.url \|\| "\/staff"/);
  assert.match(worker, /url\.pathname === "\/staff"/);
  assert.doesNotMatch(worker, /request\.mode === "navigate" && url\.pathname\.startsWith\("\/staff"\)/);
  assert.match(booking, /url:\s*"\/staff\?tab=upcoming"/);
  assert.match(sender, /deliverStaffPushOutboxWithRetry/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
});

test("push outbox has a scheduled retry consumer", async () => {
  const workerEntry = await text("worker/index.ts");
  const viteConfig = await text("vite.config.ts");
  assert.match(workerEntry, /scheduled\(/);
  assert.match(workerEntry, /drainStaffPushOutbox/);
  assert.match(viteConfig, /crons:\s*\["\* \* \* \* \*"\]/);
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
  assert.match(booking, /INSERT INTO staff_time_claims/);
  assert.match(booking, /groupStart % BOOKING_RULES\.slotMinutes/);
  assert.match(booking, /now\.minutes \+ BOOKING_RULES\.leadMinutes/);
  assert.equal((booking.match(/scheduleLockStatements\(/g) ?? []).length, 1, "legacy schedule locks must not be inserted for new bookings");
  assert.match(booking, /"reception"/);
  assert.match(breaks, /INSERT INTO staff_time_claims/);
  assert.match(bookingStatus, /INVALID_BOOKING_STATUS_TRANSITION/);
  assert.match(bookingStatus, /DELETE FROM staff_time_claims/);
  assert.match(bookingStatus, /DELETE FROM schedule_locks/);
  assert.match(dashboard, /viewer\.canViewAllBookings/);
  assert.match(push, /staff_push_deliveries/);
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
  const portal = await text("components/staff/StaffPortal.tsx");
  const credentialsRoute = await text("app/api/staff/credentials/route.ts");
  assert.match(portal, /useState\(false\)/);
  assert.match(portal, /mustChangeCredentials/);
  assert.match(portal, /REMEMBER_DEVICE_KEY/);
  assert.match(credentialsRoute, /changeOwnStaffCredentials/);
  assert.match(credentialsRoute, /assertSameOrigin/);
});

test("reduced motion disables animation instead of creating a rapid infinite flash", async () => {
  const css = await text("app/globals.css");
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none\s*!important/);
});
