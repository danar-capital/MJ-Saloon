import { env } from "cloudflare:workers";
import { sendNotification, WebPushError, type PushSubscription, type VapidDetails } from "web-push-neo";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushOutboxRow = {
  id: string;
  staff_id: string;
  payload: string;
  attempts: number;
  expires_at: number;
};

// Keep every scheduled Worker invocation comfortably below the D1 Free plan's
// 50-query ceiling, even when cleanup and the cron heartbeat run together.
export const PUSH_OUTBOX_BATCH_SIZE = 3;
export const PUSH_SUBSCRIPTIONS_PER_PASS = 2;
export const PUSH_FAST_OUTBOX_BATCH_SIZE = 2;
export const PUSH_FAST_SUBSCRIPTIONS_PER_PASS = 1;

export function pendingPushSubscriptionsSql(limit = PUSH_SUBSCRIPTIONS_PER_PASS) {
  const safeLimit = Number.isInteger(limit)
    ? Math.min(PUSH_SUBSCRIPTIONS_PER_PASS, Math.max(1, limit))
    : PUSH_SUBSCRIPTIONS_PER_PASS;
  return `
    SELECT sps.id, sps.endpoint, sps.p256dh, sps.auth
    FROM staff_push_subscriptions sps
    JOIN staff_accounts sa ON sa.id = sps.account_id
    LEFT JOIN staff_push_deliveries spd
      ON spd.subscription_id = sps.id AND spd.outbox_id = ?
    WHERE sa.active = 1 AND sa.staff_id = ? AND sps.expires_at > ?
      AND (spd.id IS NULL OR (spd.delivered_at IS NULL AND spd.next_attempt_at <= ?))
    ORDER BY
      CASE WHEN spd.id IS NULL THEN 0 ELSE 1 END,
      COALESCE(spd.attempts, 0),
      COALESCE(spd.next_attempt_at, 0),
      sps.updated_at DESC
    LIMIT ${safeLimit}
  `;
}

type DrainPushOptions = {
  staffId?: string;
  bookingId?: string;
  staffPriority?: readonly string[];
  outboxLimit?: number;
  subscriptionLimit?: number;
  cleanup?: boolean;
  finalize?: boolean;
};

function runtimeEnv() {
  return env as unknown as Record<string, string | undefined>;
}

export function pushPublicKey() {
  return runtimeEnv().VAPID_PUBLIC_KEY?.trim() ?? "";
}

function vapidDetails(): VapidDetails | null {
  const runtime = runtimeEnv();
  const publicKey = runtime.VAPID_PUBLIC_KEY?.trim();
  const privateKey = runtime.VAPID_PRIVATE_KEY?.trim();
  const subject = runtime.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function pushConfigured() {
  return Boolean(vapidDetails());
}

export async function markPushCronHeartbeat() {
  if (!env.DB) return;
  await env.DB.prepare(`
    INSERT INTO app_migrations (id, applied_at) VALUES ('push-cron-heartbeat', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET applied_at = CURRENT_TIMESTAMP
  `).run();
}

export async function sendStaffPushTest(accountId: string, displayName: string) {
  const details = vapidDetails();
  if (!details || !env.DB) return { configured: false, active: 0, delivered: 0 };
  const now = Date.now();
  const subscriptions = await env.DB.prepare("SELECT id, endpoint, p256dh, auth FROM staff_push_subscriptions WHERE account_id = ? AND expires_at > ? ORDER BY updated_at DESC LIMIT 5")
    .bind(accountId, now).all<PushSubscriptionRow>();
  if (!subscriptions.results.length) return { configured: true, active: 0, delivered: 0 };

  const payload = JSON.stringify({
    title: "MJ Team · الإشعارات جاهزة",
    body: `${displayName}، هذا إشعار تجريبي حقيقي من خادم MJ.`,
    tag: `mj-push-test-${now}`,
    url: "/staff?tab=upcoming",
  });
  let delivered = 0;
  await Promise.all(subscriptions.results.map(async (subscriptionRow) => {
    try {
      await sendNotification({
        endpoint: subscriptionRow.endpoint,
        keys: { p256dh: subscriptionRow.p256dh, auth: subscriptionRow.auth },
      }, payload, {
        vapidDetails: details,
        TTL: 5 * 60,
        urgency: "high",
        topic: `mjtest${now}`.slice(0, 32),
        signal: AbortSignal.timeout(3_000),
      });
      delivered += 1;
      await env.DB.prepare("UPDATE staff_push_subscriptions SET failure_count = 0, last_success_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(subscriptionRow.id).run();
    } catch (error) {
      const stale = error instanceof WebPushError && [404, 410].includes(error.statusCode);
      if (stale) {
        await env.DB.prepare("DELETE FROM staff_push_subscriptions WHERE id = ?").bind(subscriptionRow.id).run();
      } else {
        await env.DB.prepare("UPDATE staff_push_subscriptions SET failure_count = failure_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(subscriptionRow.id).run();
      }
    }
  }));
  return { configured: true, active: subscriptions.results.length, delivered };
}

function retryDelay(attempts: number) {
  return Math.min(5 * 60_000, 2_000 * (2 ** Math.min(7, Math.max(0, attempts - 1))));
}

let lastCleanupAt = 0;

async function cleanupPushState(now: number) {
  if (now - lastCleanupAt < 5 * 60_000) return;
  lastCleanupAt = now;
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM staff_push_deliveries WHERE outbox_id IN (SELECT id FROM staff_push_outbox WHERE expires_at <= ? OR (delivered_at IS NOT NULL AND created_at < datetime('now', '-7 days')))").bind(now),
      env.DB.prepare("DELETE FROM staff_push_outbox WHERE expires_at <= ? OR (delivered_at IS NOT NULL AND created_at < datetime('now', '-7 days'))").bind(now),
      env.DB.prepare("DELETE FROM staff_push_deliveries WHERE subscription_id IN (SELECT id FROM staff_push_subscriptions WHERE expires_at <= ?)").bind(now),
      env.DB.prepare("DELETE FROM staff_push_subscriptions WHERE expires_at <= ?").bind(now),
    ]);
  } catch (error) {
    lastCleanupAt = 0;
    throw error;
  }
}

export async function drainStaffPushOutbox(options: DrainPushOptions = {}) {
  const details = vapidDetails();
  if (!details || !env.DB) return { configured: false, delivered: 0, pending: 0, retryable: 0 };

  const now = Date.now();
  if (options.cleanup !== false) await cleanupPushState(now);
  const outboxLimit = Number.isInteger(options.outboxLimit)
    ? Math.min(PUSH_FAST_OUTBOX_BATCH_SIZE, Math.max(1, options.outboxLimit!))
    : PUSH_OUTBOX_BATCH_SIZE;
  const subscriptionLimit = Number.isInteger(options.subscriptionLimit)
    ? Math.min(PUSH_SUBSCRIPTIONS_PER_PASS, Math.max(1, options.subscriptionLimit!))
    : PUSH_SUBSCRIPTIONS_PER_PASS;
  const finalize = options.finalize !== false;
  let sql = "SELECT id, staff_id, payload, attempts, expires_at FROM staff_push_outbox WHERE delivered_at IS NULL AND next_attempt_at <= ? AND expires_at > ?";
  const bindings: Array<string | number> = [now, now];
  if (options.staffId) { sql += " AND staff_id = ?"; bindings.push(options.staffId); }
  if (options.bookingId) { sql += " AND booking_id = ?"; bindings.push(options.bookingId); }
  const staffPriority = [...new Set(options.staffPriority ?? [])].filter(Boolean).slice(0, 16);
  if (staffPriority.length) {
    sql += ` ORDER BY CASE staff_id ${staffPriority.map((_, index) => `WHEN ? THEN ${index}`).join(" ")} ELSE ${staffPriority.length} END, created_at, id`;
    bindings.push(...staffPriority);
  } else {
    sql += " ORDER BY created_at, id";
  }
  sql += ` LIMIT ${outboxLimit}`;
  const query = env.DB.prepare(sql).bind(...bindings);
  const rows = await query.all<PushOutboxRow>();
  let delivered = 0;
  let pending = 0;
  let retryable = 0;

  await Promise.all(rows.results.map(async (row) => {
    const claimed = await env.DB.prepare("UPDATE staff_push_outbox SET attempts = attempts + 1, next_attempt_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND delivered_at IS NULL AND next_attempt_at <= ? RETURNING attempts")
      .bind(now + 30_000, row.id, now).first<{ attempts: number }>();
    if (!claimed) return;

    let parsedPayload: { tag?: string };
    try {
      parsedPayload = JSON.parse(row.payload) as { tag?: string };
    } catch {
      await env.DB.prepare("UPDATE staff_push_outbox SET delivered_at = CURRENT_TIMESTAMP, last_error = 'INVALID_PAYLOAD', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(row.id).run();
      return;
    }

    const subscriptions = await env.DB.prepare(pendingPushSubscriptionsSql(subscriptionLimit))
      .bind(row.id, row.staff_id, now, now).all<PushSubscriptionRow>();
    if (!subscriptions.results.length) {
      if (!finalize) {
        pending += 1;
        return;
      }
      const deliveryState = await env.DB.prepare(`
        SELECT
          COUNT(*) AS active_count,
          SUM(CASE WHEN spd.delivered_at IS NULL THEN 1 ELSE 0 END) AS pending_count
        FROM staff_push_subscriptions sps
        JOIN staff_accounts sa ON sa.id = sps.account_id
        LEFT JOIN staff_push_deliveries spd ON spd.subscription_id = sps.id AND spd.outbox_id = ?
        WHERE sa.active = 1 AND sa.staff_id = ? AND sps.expires_at > ?
      `).bind(row.id, row.staff_id, now).first<{ active_count: number; pending_count: number | null }>();
      if ((deliveryState?.active_count ?? 0) > 0 && (deliveryState?.pending_count ?? 0) === 0) {
        delivered += 1;
        await env.DB.prepare("UPDATE staff_push_outbox SET delivered_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(row.id).run();
      } else {
        pending += 1;
        await env.DB.prepare("UPDATE staff_push_outbox SET next_attempt_at = ?, last_error = 'NO_ACTIVE_SUBSCRIPTION', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(Math.min(row.expires_at, now + 5 * 60_000), row.id).run();
      }
      return;
    }

    let transientFailures = 0;
    await Promise.all(subscriptions.results.map(async (subscriptionRow) => {
      const subscription: PushSubscription = {
        endpoint: subscriptionRow.endpoint,
        keys: { p256dh: subscriptionRow.p256dh, auth: subscriptionRow.auth },
      };
      try {
        await sendNotification(subscription, row.payload, {
          vapidDetails: details,
          TTL: Math.max(60, Math.floor((row.expires_at - now) / 1000)),
          urgency: "high",
          topic: (parsedPayload.tag ?? row.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
          signal: AbortSignal.timeout(3_000),
        });
        await env.DB.batch([
          env.DB.prepare("UPDATE staff_push_subscriptions SET failure_count = 0, last_success_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(subscriptionRow.id),
          env.DB.prepare("INSERT INTO staff_push_deliveries (id, outbox_id, subscription_id, attempts, delivered_at, last_error) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, NULL) ON CONFLICT(outbox_id, subscription_id) DO UPDATE SET attempts = staff_push_deliveries.attempts + 1, delivered_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP")
            .bind(crypto.randomUUID(), row.id, subscriptionRow.id),
        ]);
      } catch (error) {
        const stale = error instanceof WebPushError && [404, 410].includes(error.statusCode);
        if (stale) {
          await env.DB.batch([
            env.DB.prepare("DELETE FROM staff_push_deliveries WHERE subscription_id = ?").bind(subscriptionRow.id),
            env.DB.prepare("DELETE FROM staff_push_subscriptions WHERE id = ?").bind(subscriptionRow.id),
          ]);
        } else {
          transientFailures += 1;
          await env.DB.batch([
            env.DB.prepare("UPDATE staff_push_subscriptions SET failure_count = failure_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
              .bind(subscriptionRow.id),
            env.DB.prepare("INSERT INTO staff_push_deliveries (id, outbox_id, subscription_id, attempts, next_attempt_at, last_error) VALUES (?, ?, ?, 1, ?, 'DELIVERY_RETRY') ON CONFLICT(outbox_id, subscription_id) DO UPDATE SET attempts = staff_push_deliveries.attempts + 1, next_attempt_at = excluded.next_attempt_at, last_error = excluded.last_error, updated_at = CURRENT_TIMESTAMP")
              .bind(crypto.randomUUID(), row.id, subscriptionRow.id, now + retryDelay(claimed.attempts)),
          ]);
        }
      }
    }));

    if (!finalize) {
      pending += 1;
      if (transientFailures) retryable += 1;
      return;
    }

    const deliveryState = await env.DB.prepare(`
      SELECT
        COUNT(*) AS active_count,
        SUM(CASE WHEN spd.delivered_at IS NULL THEN 1 ELSE 0 END) AS pending_count
      FROM staff_push_subscriptions sps
      JOIN staff_accounts sa ON sa.id = sps.account_id
      LEFT JOIN staff_push_deliveries spd ON spd.subscription_id = sps.id AND spd.outbox_id = ?
      WHERE sa.active = 1 AND sa.staff_id = ? AND sps.expires_at > ?
    `).bind(row.id, row.staff_id, now).first<{ active_count: number; pending_count: number | null }>();
    if ((deliveryState?.active_count ?? 0) > 0 && (deliveryState?.pending_count ?? 0) === 0) {
      delivered += 1;
      await env.DB.prepare("UPDATE staff_push_outbox SET delivered_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(row.id).run();
    } else {
      pending += 1;
      if (transientFailures) retryable += 1;
      const lastError = transientFailures
        ? "DELIVERY_RETRY"
        : (deliveryState?.active_count ?? 0) > 0 ? "DELIVERY_PENDING" : "NO_ACTIVE_SUBSCRIPTION";
      await env.DB.prepare("UPDATE staff_push_outbox SET next_attempt_at = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(Math.min(row.expires_at, now + retryDelay(claimed.attempts)), lastError, row.id).run();
    }
  }));

  return { configured: true, delivered, pending, retryable };
}
