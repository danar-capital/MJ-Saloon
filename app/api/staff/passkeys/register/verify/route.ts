import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { apiError, getD1 } from "@/lib/booking-server";
import { consumePasskeyChallenge, encodePublicKey, passkeyContext } from "@/lib/passkey-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const payload = await request.json() as { challengeId?: string; response?: RegistrationResponseJSON };
    if (!payload.challengeId || !payload.response) return Response.json({ error: "PASSKEY_DETAILS_REQUIRED" }, { status: 400 });
    const challenge = await consumePasskeyChallenge(payload.challengeId, viewer.accountId, "registration");
    const { rpID, origin } = passkeyContext(request);
    const verification = await verifyRegistrationResponse({
      response: payload.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error("PASSKEY_VERIFICATION_FAILED");
    const info = verification.registrationInfo;
    const transports = info.credential.transports ?? payload.response.response.transports ?? [];
    const existing = await getD1().prepare("SELECT account_id FROM staff_passkeys WHERE credential_id = ?")
      .bind(info.credential.id).first<{ account_id: string }>();
    if (existing && existing.account_id !== viewer.accountId) throw new Error("PASSKEY_ALREADY_REGISTERED");
    await getD1().batch([
      getD1().prepare("INSERT INTO staff_passkeys (id, account_id, credential_id, public_key, counter, transports, device_type, backed_up) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(credential_id) DO UPDATE SET account_id = excluded.account_id, public_key = excluded.public_key, counter = excluded.counter, transports = excluded.transports, device_type = excluded.device_type, backed_up = excluded.backed_up")
        .bind(crypto.randomUUID(), viewer.accountId, info.credential.id, encodePublicKey(info.credential.publicKey), info.credential.counter, JSON.stringify(transports), info.credentialDeviceType, info.credentialBackedUp ? 1 : 0),
    ]);
    const count = await getD1().prepare("SELECT COUNT(*) AS count FROM staff_passkeys WHERE account_id = ?").bind(viewer.accountId).first<{ count: number }>();
    return Response.json({ verified: true, count: count?.count ?? 1 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
