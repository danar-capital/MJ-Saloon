import { apiError } from "@/lib/booking-server";
import { loginStaff, staffSessionCookie } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { username?: string; password?: string };
    if (!payload.username || !payload.password) return Response.json({ error: "CREDENTIALS_REQUIRED" }, { status: 400 });
    const result = await loginStaff(payload.username, payload.password);
    return Response.json({ viewer: result.viewer }, { headers: { "Set-Cookie": staffSessionCookie(result.token), "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "INVALID_CREDENTIALS") return Response.json({ error: message }, { status: 401 });
    if (message === "ACCOUNT_LOCKED") return Response.json({ error: message }, { status: 429 });
    return apiError(error);
  }
}
