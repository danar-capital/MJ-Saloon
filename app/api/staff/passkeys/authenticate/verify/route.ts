import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { consumePasskeyChallenge, decodePublicKey, parseTransports, passkeyContext } from "@/lib/passkey-server";
import { assertSameOrigin, clearLegacyStaffSessionCookie, createStaffSession, staffSessionCookie } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json() as { challengeId?: string; response?: AuthenticationResponseJSON; remember?: boolean };
    if (!payload.challengeId || !payload.response) return Response.json({ error: "PASSKEY_DETAILS_REQUIRED" }, { status: 400 });
    await ensureCatalogSeed();
    const challengeAccount = await getD1().prepare("SELECT account_id FROM staff_passkey_challenges WHERE id = ? AND purpose = 'authentication'")
      .bind(payload.challengeId).first<{ account_id: string }>();
    if (!challengeAccount) throw new Error("PASSKEY_CHALLENGE_EXPIRED");
    const challenge = await consumePasskeyChallenge(payload.challengeId, challengeAccount.account_id, "authentication");
    const passkey = await getD1().prepare("SELECT id, credential_id, public_key, counter, transports FROM staff_passkeys WHERE account_id = ? AND credential_id = ?")
      .bind(challengeAccount.account_id, payload.response.id).first<{ id: string; credential_id: string; public_key: string; counter: number; transports: string }>();
    if (!passkey) throw new Error("PASSKEY_NOT_REGISTERED");
    const { rpID, origin } = passkeyContext(request);
    const verification = await verifyAuthenticationResponse({
      response: payload.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: passkey.credential_id, publicKey: decodePublicKey(passkey.public_key), counter: passkey.counter, transports: parseTransports(passkey.transports) },
      requireUserVerification: true,
    });
    if (!verification.verified) throw new Error("PASSKEY_VERIFICATION_FAILED");
    await getD1().batch([
      getD1().prepare("UPDATE staff_passkeys SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(verification.authenticationInfo.newCounter, passkey.id),
    ]);
    const remembered = payload.remember === true;
    const session = await createStaffSession(challengeAccount.account_id, remembered);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", staffSessionCookie(session.token, remembered));
    headers.append("Set-Cookie", clearLegacyStaffSessionCookie());
    return Response.json({ viewer: session.viewer }, { headers });
  } catch (error) {
    return apiError(error);
  }
}
