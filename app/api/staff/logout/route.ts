import { apiError } from "@/lib/booking-server";
import { assertSameOrigin, clearLegacyStaffSessionCookie, clearStaffSessionCookie, logoutStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json().catch(() => ({})) as { pushEndpoint?: string | null };
    const pushEndpoint = typeof payload.pushEndpoint === "string" && payload.pushEndpoint.length <= 2048 ? payload.pushEndpoint : null;
    await logoutStaff(request, pushEndpoint);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearStaffSessionCookie());
    headers.append("Set-Cookie", clearLegacyStaffSessionCookie());
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return apiError(error);
  }
}
