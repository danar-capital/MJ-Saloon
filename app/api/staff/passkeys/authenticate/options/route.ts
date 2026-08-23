import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { accountPasskeys, parseTransports, passkeyContext, savePasskeyChallenge } from "@/lib/passkey-server";
import { assertSameOrigin, normalizeStaffUsername } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json() as { username?: string };
    const username = normalizeStaffUsername(payload.username ?? "");
    if (!username) return Response.json({ error: "USERNAME_REQUIRED" }, { status: 400 });
    await ensureCatalogSeed();
    const account = await getD1().prepare("SELECT id FROM staff_accounts WHERE username = ? AND active = 1")
      .bind(username).first<{ id: string }>();
    if (!account) return Response.json({ error: "PASSKEY_NOT_REGISTERED" }, { status: 404 });
    const passkeys = await accountPasskeys(account.id);
    if (!passkeys.length) return Response.json({ error: "PASSKEY_NOT_REGISTERED" }, { status: 404 });
    const { rpID } = passkeyContext(request);
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60_000,
      userVerification: "required",
      allowCredentials: passkeys.map((key) => ({ id: key.credential_id, transports: parseTransports(key.transports) })),
    });
    const challenge = await savePasskeyChallenge(account.id, "authentication", options.challenge);
    return Response.json({ options, challengeId: challenge.id, expiresAt: challenge.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
