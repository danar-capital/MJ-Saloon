import { apiError, getD1 } from "@/lib/booking-server";
import { pushConfigured, pushPublicKey } from "@/lib/push-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";
const PUSH_SUBSCRIPTION_LIFETIME_MS = 180 * 24 * 60 * 60_000;

type SubscriptionPayload = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function privateHostname(hostname: string) {
  if (["localhost", "::1", "[::1]"].includes(hostname) || hostname.endsWith(".local")) return true;
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
}

function validSubscription(payload: SubscriptionPayload, request: Request) {
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) return false;
  try {
    const endpoint = new URL(payload.endpoint);
    const p256dh = decodeBase64Url(payload.keys.p256dh);
    const auth = decodeBase64Url(payload.keys.auth);
    return endpoint.protocol === "https:"
      && !endpoint.username && !endpoint.password
      && endpoint.hostname !== new URL(request.url).hostname
      && !privateHostname(endpoint.hostname)
      && payload.endpoint.length <= 2048
      && payload.keys.p256dh.length <= 256
      && payload.keys.auth.length <= 128
      && p256dh?.length === 65 && p256dh[0] === 4
      && Boolean(auth && auth.length >= 16 && auth.length <= 32);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const viewer = await requireStaffSession(request);
    const count = await getD1().prepare("SELECT COUNT(*) AS count FROM staff_push_subscriptions WHERE account_id = ? AND expires_at > ?")
      .bind(viewer.accountId, Date.now()).first<{ count: number }>();
    const publicKey = pushPublicKey();
    return Response.json({
      configured: pushConfigured(),
      publicKey,
      subscriptionCount: count?.count ?? 0,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const payload = await request.json() as { subscription?: SubscriptionPayload };
    const subscription = payload.subscription;
    if (!subscription || !validSubscription(subscription, request)) {
      return Response.json({ error: "INVALID_PUSH_SUBSCRIPTION" }, { status: 400 });
    }
    const db = getD1();
    await db.batch([
      db.prepare(`
      INSERT INTO staff_push_subscriptions (id, account_id, endpoint, p256dh, auth, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        account_id = excluded.account_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        expires_at = excluded.expires_at,
        failure_count = 0,
        updated_at = CURRENT_TIMESTAMP
      `).bind(
      crypto.randomUUID(),
      viewer.accountId,
      subscription.endpoint,
      subscription.keys!.p256dh,
      subscription.keys!.auth,
      (request.headers.get("user-agent") ?? "").slice(0, 300),
      Math.min(Date.now() + PUSH_SUBSCRIPTION_LIFETIME_MS, viewer.sessionExpiresAt),
      ),
      db.prepare("DELETE FROM staff_push_subscriptions WHERE account_id = ? AND id NOT IN (SELECT id FROM staff_push_subscriptions WHERE account_id = ? ORDER BY updated_at DESC LIMIT 5)")
        .bind(viewer.accountId, viewer.accountId),
    ]);
    return Response.json({ enabled: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const payload = await request.json().catch(() => ({})) as { endpoint?: string };
    if (!payload.endpoint) return Response.json({ error: "PUSH_ENDPOINT_REQUIRED" }, { status: 400 });
    await getD1().prepare("DELETE FROM staff_push_subscriptions WHERE account_id = ? AND endpoint = ?")
      .bind(viewer.accountId, payload.endpoint).run();
    return Response.json({ enabled: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
