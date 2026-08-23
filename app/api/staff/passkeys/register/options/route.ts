import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";
import { apiError } from "@/lib/booking-server";
import { accountPasskeys, parseTransports, passkeyContext, savePasskeyChallenge } from "@/lib/passkey-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const { rpID } = passkeyContext(request);
    const passkeys = await accountPasskeys(viewer.accountId);
    const options = await generateRegistrationOptions({
      rpName: "MJ Team",
      rpID,
      userID: isoUint8Array.fromUTF8String(viewer.accountId),
      userName: viewer.username,
      userDisplayName: viewer.name,
      timeout: 60_000,
      attestationType: "none",
      excludeCredentials: passkeys.map((key) => ({ id: key.credential_id, transports: parseTransports(key.transports) })),
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
      preferredAuthenticatorType: "localDevice",
    });
    const challenge = await savePasskeyChallenge(viewer.accountId, "registration", options.challenge);
    return Response.json({ options, challengeId: challenge.id, expiresAt: challenge.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
