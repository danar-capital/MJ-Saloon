import { apiError } from "@/lib/booking-server";
import { sendStaffPushTest } from "@/lib/push-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    const result = await sendStaffPushTest(viewer.accountId, viewer.name);
    if (!result.configured) return Response.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503 });
    if (!result.active) return Response.json({ error: "PUSH_SUBSCRIPTION_REQUIRED" }, { status: 409 });
    if (!result.delivered) return Response.json({ error: "PUSH_DELIVERY_FAILED" }, { status: 502 });
    return Response.json({ delivered: result.delivered }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
