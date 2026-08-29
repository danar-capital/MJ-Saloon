import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { ensureCatalogSeed, getD1 } from "@/lib/booking-server";

export type PasskeyRow = {
  id: string;
  account_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string;
  device_type: "singleDevice" | "multiDevice";
  backed_up: number;
};

export function passkeyContext(request: Request) {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
}

export function encodePublicKey(value: Uint8Array) {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return isoBase64URL.fromBuffer(copy);
}

export function decodePublicKey(value: string) {
  return isoBase64URL.toBuffer(value);
}

export async function savePasskeyChallenge(accountId: string, purpose: "registration" | "authentication", challenge: string) {
  await ensureCatalogSeed();
  const db = getD1();
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60_000;
  await db.batch([
    db.prepare("DELETE FROM staff_passkey_challenges WHERE expires_at < ?").bind(Date.now()),
    db.prepare("INSERT INTO staff_passkey_challenges (id, account_id, challenge, purpose, expires_at) VALUES (?, ?, ?, ?, ?)").bind(id, accountId, challenge, purpose, expiresAt),
  ]);
  return { id, expiresAt };
}

export async function consumePasskeyChallenge(id: string, accountId: string, purpose: "registration" | "authentication") {
  await ensureCatalogSeed();
  const db = getD1();
  const row = await db.prepare("DELETE FROM staff_passkey_challenges WHERE id = ? AND account_id = ? AND purpose = ? AND expires_at >= ? RETURNING id, challenge, expires_at")
    .bind(id, accountId, purpose, Date.now()).first<{ id: string; challenge: string; expires_at: number }>();
  if (!row) {
    await db.prepare("DELETE FROM staff_passkey_challenges WHERE id = ? AND account_id = ? AND purpose = ?")
      .bind(id, accountId, purpose).run();
    throw new Error("PASSKEY_CHALLENGE_EXPIRED");
  }
  return row;
}

export async function accountPasskeys(accountId: string) {
  await ensureCatalogSeed();
  const result = await getD1().prepare("SELECT id, account_id, credential_id, public_key, counter, transports, device_type, backed_up FROM staff_passkeys WHERE account_id = ? ORDER BY created_at")
    .bind(accountId).all<PasskeyRow>();
  return result.results;
}

export function parseTransports(value: string) {
  try {
    const transports = JSON.parse(value);
    return Array.isArray(transports) ? transports : [];
  } catch {
    return [];
  }
}
