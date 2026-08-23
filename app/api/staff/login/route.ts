import { apiError } from "@/lib/booking-server";
import { assertSameOrigin, clearLegacyStaffSessionCookie, loginStaff, staffSessionCookie } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json() as { username?: string; password?: string; remember?: boolean };
    if (!payload.username || !payload.password) return Response.json({ error: "CREDENTIALS_REQUIRED" }, { status: 400 });
    const remembered = payload.remember === true;
    const clientFingerprint = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
    const result = await loginStaff(payload.username, payload.password, remembered, clientFingerprint);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", staffSessionCookie(result.token, remembered));
    headers.append("Set-Cookie", clearLegacyStaffSessionCookie());
    return Response.json({ viewer: result.viewer }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "INVALID_CREDENTIALS") return Response.json({ error: message }, { status: 401 });
    if (message === "ACCOUNT_LOCKED") return Response.json({ error: message }, { status: 429 });
    return apiError(error);
  }
}
