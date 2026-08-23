import { apiError } from "@/lib/booking-server";
import { assertSameOrigin, changeOwnStaffCredentials, requireStaffSession, staffSessionCookie } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request, false, true);
    const payload = await request.json() as {
      currentPassword?: string;
      username?: string;
      newPassword?: string;
      remembered?: boolean;
    };
    if (!payload.currentPassword || !payload.username) {
      return Response.json({ error: "CREDENTIAL_FIELDS_REQUIRED" }, { status: 400 });
    }
    const session = await changeOwnStaffCredentials({
      accountId: viewer.accountId,
      currentPassword: payload.currentPassword,
      username: payload.username,
      newPassword: payload.newPassword,
      remembered: payload.remembered === true,
    });
    return Response.json({ viewer: session.viewer }, {
      headers: {
        "Set-Cookie": staffSessionCookie(session.token, payload.remembered === true),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (["CURRENT_PASSWORD_INVALID", "INVALID_USERNAME", "USERNAME_TAKEN", "NEW_PASSWORD_REQUIRED", "WEAK_PASSWORD", "PASSWORD_UNCHANGED"].includes(message)) {
      return Response.json({ error: message }, { status: message === "USERNAME_TAKEN" ? 409 : 400 });
    }
    return apiError(error);
  }
}
