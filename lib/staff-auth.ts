import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureCatalogSeed, getD1, normalizePhone } from "@/lib/booking-server";

const ownerEmails = new Set(["danarcapital@gmail.com"]);
const SESSION_COOKIE = "mj_staff_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 210_000;

export type StaffViewer = {
  accountId: string;
  staffId: string;
  username: string;
  name: string;
  role: "owner" | "staff";
  isOwner: boolean;
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

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export function staffSessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearStaffSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
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
  const username = normalizeUsername(input.username);
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
    db.prepare("INSERT INTO staff_accounts (id, staff_id, username, password_salt, password_hash, role, active) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(staff_id) DO UPDATE SET username = excluded.username, password_salt = excluded.password_salt, password_hash = excluded.password_hash, role = excluded.role, active = 1, failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP")
      .bind(crypto.randomUUID(), input.staffId, username, salt, hash, role),
    db.prepare("UPDATE staff_members SET whatsapp_phone = COALESCE(?, whatsapp_phone), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(phone, input.staffId),
  ]);
  return { staffId: input.staffId, username, role };
}

export async function loginStaff(usernameValue: string, password: string) {
  await ensureCatalogSeed();
  const username = normalizeUsername(usernameValue);
  const db = getD1();
  const account = await db.prepare("SELECT sa.id, sa.staff_id, sa.username, sa.password_salt, sa.password_hash, sa.role, sa.active, sa.failed_attempts, sa.locked_until, sm.name FROM staff_accounts sa JOIN staff_members sm ON sm.id = sa.staff_id WHERE sa.username = ?")
    .bind(username).first<AccountRow>();
  const now = Date.now();
  if (!account || !account.active) throw new Error("INVALID_CREDENTIALS");
  if (account.locked_until && account.locked_until > now) throw new Error("ACCOUNT_LOCKED");
  const suppliedHash = await passwordDigest(password, account.password_salt);
  if (!constantTimeEqual(suppliedHash, account.password_hash)) {
    const attempts = account.failed_attempts + 1;
    const lockedUntil = attempts >= 5 ? now + 15 * 60_000 : null;
    await db.prepare("UPDATE staff_accounts SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attempts >= 5 ? 0 : attempts, lockedUntil, account.id).run();
    throw new Error(lockedUntil ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS");
  }
  const token = randomToken(36);
  const tokenHash = await sha256(token);
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  await db.batch([
    db.prepare("UPDATE staff_accounts SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(account.id),
    db.prepare("DELETE FROM staff_sessions WHERE expires_at < ?").bind(now),
    db.prepare("INSERT INTO staff_sessions (id, account_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), account.id, tokenHash, expiresAt),
  ]);
  return {
    token,
    viewer: { accountId: account.id, staffId: account.staff_id, username: account.username, name: account.name, role: account.role, isOwner: account.role === "owner" } satisfies StaffViewer,
  };
}

export async function getStaffSession(request: Request): Promise<StaffViewer | null> {
  await ensureCatalogSeed();
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const db = getD1();
  const row = await db.prepare("SELECT sa.id AS account_id, sa.staff_id, sa.username, sa.role, sa.active, ss.id AS session_id, ss.expires_at, sm.name FROM staff_sessions ss JOIN staff_accounts sa ON sa.id = ss.account_id JOIN staff_members sm ON sm.id = sa.staff_id WHERE ss.token_hash = ?")
    .bind(tokenHash).first<{ account_id: string; staff_id: string; username: string; role: "owner" | "staff"; active: number; session_id: string; expires_at: number; name: string }>();
  if (!row || !row.active || row.expires_at < Date.now()) {
    if (row?.session_id) await db.prepare("DELETE FROM staff_sessions WHERE id = ?").bind(row.session_id).run();
    return null;
  }
  await db.prepare("UPDATE staff_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.session_id).run();
  return { accountId: row.account_id, staffId: row.staff_id, username: row.username, name: row.name, role: row.role, isOwner: row.role === "owner" };
}

export async function requireStaffSession(request: Request, ownerOnly = false) {
  const viewer = await getStaffSession(request);
  if (!viewer || (ownerOnly && !viewer.isOwner)) throw new Error("STAFF_UNAUTHORIZED");
  return viewer;
}

export async function logoutStaff(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return;
  const db = getD1();
  await db.prepare("DELETE FROM staff_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
