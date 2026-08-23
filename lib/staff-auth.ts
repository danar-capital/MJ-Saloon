import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureCatalogSeed, getD1, normalizePhone } from "@/lib/booking-server";

const ownerEmails = new Set(["danarcapital9@gmail.com"]);
const SESSION_COOKIE = "mj_staff_session_v2";
const LEGACY_SESSION_COOKIE = "mj_staff_session";
const STANDARD_SESSION_SECONDS = 60 * 60 * 12;
const REMEMBERED_SESSION_SECONDS = 60 * 60 * 24 * 30;
// Cloudflare Workers Web Crypto currently caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;

export type StaffViewer = {
  accountId: string;
  staffId: string;
  username: string;
  name: string;
  role: "owner" | "staff";
  isOwner: boolean;
  isReception: boolean;
  canViewAllBookings: boolean;
  mustChangeCredentials: boolean;
  sessionExpiresAt: number;
};

type AccountRow = {
  id: string;
  staff_id: string;
  username: string;
  password_salt: string;
  password_hash: string;
  role: "owner" | "staff";
  active: number;
  failed_attempts: number;
  locked_until: number | null;
  must_change_credentials: number;
  name: string;
};

function encodeBytes(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBytes(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encodeBytes(new Uint8Array(digest));
}

async function passwordDigest(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return encodeBytes(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export function normalizeStaffUsername(value: string) {
  return value.trim().toLowerCase();
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export function staffSessionCookie(token: string, remembered = false) {
  const persistence = remembered ? `; Max-Age=${REMEMBERED_SESSION_SECONDS}` : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${persistence}`;
}

export function clearStaffSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function clearLegacyStaffSessionCookie() {
  return `${LEGACY_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new Error("STAFF_BAD_ORIGIN");
}

export async function assertOwner() {
  const user = await getChatGPTUser();
  if (!user || !ownerEmails.has(user.email.toLowerCase())) throw new Error("STAFF_UNAUTHORIZED");
  return user;
}

export function isOwnerEmail(email: string) {
  return ownerEmails.has(email.toLowerCase());
}

export async function saveStaffAccount(input: {
  staffId: string;
  username: string;
  password: string;
  role?: "owner" | "staff";
  whatsappPhone?: string;
}) {
  await ensureCatalogSeed();
  const username = normalizeStaffUsername(input.username);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("INVALID_USERNAME");
  if (input.password.length < 10 || input.password.length > 128) throw new Error("WEAK_PASSWORD");
  const db = getD1();
  const staff = await db.prepare("SELECT id FROM staff_members WHERE id = ?").bind(input.staffId).first<{ id: string }>();
  if (!staff) throw new Error("STAFF_NOT_FOUND");
  const existingUsername = await db.prepare("SELECT staff_id FROM staff_accounts WHERE username = ? AND staff_id <> ?").bind(username, input.staffId).first<{ staff_id: string }>();
  if (existingUsername) throw new Error("USERNAME_TAKEN");
  const salt = randomToken(18);
  const hash = await passwordDigest(input.password, salt);
  const role = input.role === "owner" ? "owner" : "staff";
  const phone = input.whatsappPhone?.trim() ? normalizePhone(input.whatsappPhone) : null;
  await db.batch([
    db.prepare("INSERT INTO staff_accounts (id, staff_id, username, password_salt, password_hash, role, active, must_change_credentials) VALUES (?, ?, ?, ?, ?, ?, 1, 1) ON CONFLICT(staff_id) DO UPDATE SET username = excluded.username, password_salt = excluded.password_salt, password_hash = excluded.password_hash, role = excluded.role, active = 1, failed_attempts = 0, locked_until = NULL, must_change_credentials = 1, updated_at = CURRENT_TIMESTAMP")
      .bind(crypto.randomUUID(), input.staffId, username, salt, hash, role),
    db.prepare("UPDATE staff_members SET whatsapp_phone = COALESCE(?, whatsapp_phone), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(phone, input.staffId),
    db.prepare("DELETE FROM staff_sessions WHERE account_id = (SELECT id FROM staff_accounts WHERE staff_id = ?)").bind(input.staffId),
    db.prepare("DELETE FROM staff_passkeys WHERE account_id = (SELECT id FROM staff_accounts WHERE staff_id = ?)").bind(input.staffId),
    db.prepare("DELETE FROM staff_passkey_challenges WHERE account_id = (SELECT id FROM staff_accounts WHERE staff_id = ?)").bind(input.staffId),
    db.prepare("DELETE FROM staff_push_subscriptions WHERE account_id = (SELECT id FROM staff_accounts WHERE staff_id = ?)").bind(input.staffId),
    db.prepare("DELETE FROM staff_push_outbox WHERE staff_id = ? AND delivered_at IS NULL").bind(input.staffId),
  ]);
  return { staffId: input.staffId, username, role };
}

export async function loginStaff(usernameValue: string, password: string, remembered = false, clientFingerprint = "unknown") {
  const username = normalizeStaffUsername(usernameValue);
  const db = getD1();
  const bucketKey = await sha256(`${username}:${clientFingerprint.slice(0, 180)}`);
  const attempt = await db.prepare("SELECT attempts, blocked_until FROM staff_login_attempts WHERE bucket_key = ?")
    .bind(bucketKey).first<{ attempts: number; blocked_until: number | null }>();
  const now = Date.now();
  if (attempt?.blocked_until && attempt.blocked_until > now) throw new Error("ACCOUNT_LOCKED");
  const account = await db.prepare("SELECT sa.id, sa.staff_id, sa.username, sa.password_salt, sa.password_hash, sa.role, sa.active, sa.failed_attempts, sa.locked_until, sa.must_change_credentials, COALESCE(NULLIF(sm.profile_name, ''), sm.name) AS name FROM staff_accounts sa JOIN staff_members sm ON sm.id = sa.staff_id WHERE sa.username = ?")
    .bind(username).first<AccountRow>();
  const valid = Boolean(account?.active) && constantTimeEqual(await passwordDigest(password, account?.password_salt ?? "invalid-salt"), account?.password_hash ?? "invalid-hash");
  if (!account || !valid) {
    const nextAttempts = (attempt?.attempts ?? 0) + 1;
    const blockedUntil = nextAttempts >= 10 ? now + 15 * 60_000 : null;
    await db.prepare("INSERT INTO staff_login_attempts (bucket_key, attempts, blocked_until) VALUES (?, ?, ?) ON CONFLICT(bucket_key) DO UPDATE SET attempts = excluded.attempts, blocked_until = excluded.blocked_until, updated_at = CURRENT_TIMESTAMP")
      .bind(bucketKey, blockedUntil ? 0 : nextAttempts, blockedUntil).run();
    throw new Error(blockedUntil ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS");
  }
  await db.batch([
    db.prepare("DELETE FROM staff_login_attempts WHERE bucket_key = ?").bind(bucketKey),
    db.prepare("UPDATE staff_accounts SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(account.id),
  ]);
  return createStaffSession(account.id, remembered);
}

export async function createStaffSession(accountId: string, remembered = false) {
  const db = getD1();
  const account = await db.prepare("SELECT sa.id, sa.staff_id, sa.username, sa.role, sa.active, sa.must_change_credentials, COALESCE(NULLIF(sm.profile_name, ''), sm.name) AS name FROM staff_accounts sa JOIN staff_members sm ON sm.id = sa.staff_id WHERE sa.id = ?")
    .bind(accountId).first<{ id: string; staff_id: string; username: string; role: "owner" | "staff"; active: number; must_change_credentials: number; name: string }>();
  if (!account?.active) throw new Error("INVALID_CREDENTIALS");
  const now = Date.now();
  const token = randomToken(36);
  const tokenHash = await sha256(token);
  const expiresAt = now + (remembered ? REMEMBERED_SESSION_SECONDS : STANDARD_SESSION_SECONDS) * 1000;
  await db.batch([
    db.prepare("DELETE FROM staff_sessions WHERE expires_at < ?").bind(now),
    db.prepare("INSERT INTO staff_sessions (id, account_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), account.id, tokenHash, expiresAt),
  ]);
  return {
    token,
    viewer: {
      accountId: account.id,
      staffId: account.staff_id,
      username: account.username,
      name: account.name,
      role: account.role,
      isOwner: account.role === "owner",
      isReception: account.staff_id === "reception",
      canViewAllBookings: account.role === "owner" || account.staff_id === "reception",
      mustChangeCredentials: Boolean(account.must_change_credentials),
      sessionExpiresAt: expiresAt,
    } satisfies StaffViewer,
  };
}

export async function getStaffSession(request: Request): Promise<StaffViewer | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const db = getD1();
  const row = await db.prepare("SELECT sa.id AS account_id, sa.staff_id, sa.username, sa.role, sa.active, sa.must_change_credentials, ss.id AS session_id, ss.expires_at, COALESCE(NULLIF(sm.profile_name, ''), sm.name) AS name FROM staff_sessions ss JOIN staff_accounts sa ON sa.id = ss.account_id JOIN staff_members sm ON sm.id = sa.staff_id WHERE ss.token_hash = ?")
    .bind(tokenHash).first<{ account_id: string; staff_id: string; username: string; role: "owner" | "staff"; active: number; must_change_credentials: number; session_id: string; expires_at: number; name: string }>();
  if (!row || !row.active || row.expires_at < Date.now()) {
    if (row?.session_id) await db.prepare("DELETE FROM staff_sessions WHERE id = ?").bind(row.session_id).run();
    return null;
  }
  await db.prepare("UPDATE staff_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND last_seen_at < datetime('now', '-5 minutes')").bind(row.session_id).run();
  return {
    accountId: row.account_id,
    staffId: row.staff_id,
    username: row.username,
    name: row.name,
    role: row.role,
    isOwner: row.role === "owner",
    isReception: row.staff_id === "reception",
    canViewAllBookings: row.role === "owner" || row.staff_id === "reception",
    mustChangeCredentials: Boolean(row.must_change_credentials),
    sessionExpiresAt: row.expires_at,
  };
}

export async function changeOwnStaffCredentials(input: {
  accountId: string;
  currentPassword: string;
  username: string;
  newPassword?: string;
  remembered?: boolean;
}) {
  const db = getD1();
  const account = await db.prepare("SELECT id, username, password_salt, password_hash, must_change_credentials FROM staff_accounts WHERE id = ? AND active = 1")
    .bind(input.accountId).first<{ id: string; username: string; password_salt: string; password_hash: string; must_change_credentials: number }>();
  if (!account) throw new Error("INVALID_CREDENTIALS");
  const currentHash = await passwordDigest(input.currentPassword, account.password_salt);
  if (!constantTimeEqual(currentHash, account.password_hash)) throw new Error("CURRENT_PASSWORD_INVALID");
  const username = normalizeStaffUsername(input.username);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("INVALID_USERNAME");
  const duplicate = await db.prepare("SELECT id FROM staff_accounts WHERE username = ? AND id <> ?").bind(username, account.id).first<{ id: string }>();
  if (duplicate) throw new Error("USERNAME_TAKEN");
  const newPassword = input.newPassword ?? "";
  if (account.must_change_credentials && !newPassword) throw new Error("NEW_PASSWORD_REQUIRED");
  if (newPassword && (newPassword.length < 10 || newPassword.length > 128)) throw new Error("WEAK_PASSWORD");
  if (newPassword) {
    const repeatedHash = await passwordDigest(newPassword, account.password_salt);
    if (constantTimeEqual(repeatedHash, account.password_hash)) throw new Error("PASSWORD_UNCHANGED");
  }
  const salt = newPassword ? randomToken(18) : account.password_salt;
  const hash = newPassword ? await passwordDigest(newPassword, salt) : account.password_hash;
  await db.batch([
    db.prepare("UPDATE staff_accounts SET username = ?, password_salt = ?, password_hash = ?, must_change_credentials = 0, failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(username, salt, hash, account.id),
    db.prepare("DELETE FROM staff_sessions WHERE account_id = ?").bind(account.id),
    db.prepare("DELETE FROM staff_passkey_challenges WHERE account_id = ?").bind(account.id),
    db.prepare("INSERT INTO system_events (type, actor_id, payload) VALUES ('staff.credentials_changed', ?, ?)")
      .bind(account.id, JSON.stringify({ usernameChanged: username !== account.username, passwordChanged: Boolean(newPassword) })),
  ]);
  return createStaffSession(account.id, input.remembered);
}

export async function requireStaffSession(request: Request, ownerOnly = false, allowTemporaryCredentials = false) {
  const viewer = await getStaffSession(request);
  if (!viewer || (ownerOnly && !viewer.isOwner)) throw new Error("STAFF_UNAUTHORIZED");
  if (viewer.mustChangeCredentials && !allowTemporaryCredentials) throw new Error("STAFF_CREDENTIAL_CHANGE_REQUIRED");
  return viewer;
}

export async function logoutStaff(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return;
  const db = getD1();
  await db.prepare("DELETE FROM staff_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
