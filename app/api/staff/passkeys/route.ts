import { apiError, getD1 } from "@/lib/booking-server";
import { accountPasskeys } from "@/lib/passkey-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const viewer = await requireStaffSession(request);
    const passkeys = await accountPasskeys(viewer.accountId);
    return Response.json({ count: passkeys.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireStaffSession(request);
    await getD1().prepare("DELETE FROM staff_passkeys WHERE account_id = ?").bind(viewer.accountId).run();
    return Response.json({ count: 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
