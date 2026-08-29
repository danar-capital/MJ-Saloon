import { waitUntil } from "cloudflare:workers";
import { apiError, getD1 } from "@/lib/booking-server";
import { drainStaffPushOutbox } from "@/lib/push-server";
import { requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const viewer = await requireStaffSession(request, false, false, false);
    const row = await getD1().prepare("SELECT COALESCE(MAX(id), 0) AS version FROM system_events")
      .first<{ version: number }>();
    waitUntil(drainStaffPushOutbox({
      staffId: viewer.canViewAllBookings ? undefined : viewer.staffId,
      outboxLimit: 1,
      subscriptionLimit: 1,
      cleanup: false,
    }));
    return Response.json({ version: row?.version ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
