import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { assertSameOrigin, requireStaffSession, saveStaffAccount } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireStaffSession(request, true);
    await ensureCatalogSeed();
    const result = await getD1().prepare("SELECT sm.id AS staff_id, COALESCE(NULLIF(sm.profile_name, ''), sm.name) AS name, sm.whatsapp_phone, sm.profile_image_updated_at, sa.username, sa.role, sa.active, sa.updated_at FROM staff_members sm LEFT JOIN staff_accounts sa ON sa.staff_id = sm.id ORDER BY sm.sort_order").all();
    return Response.json({ accounts: result.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireStaffSession(request, true);
    const payload = await request.json() as { staffId?: string; username?: string; password?: string; whatsappPhone?: string; role?: "owner" | "staff" };
    if (!payload.staffId || !payload.username || !payload.password) return Response.json({ error: "ACCOUNT_FIELDS_REQUIRED" }, { status: 400 });
    const account = await saveStaffAccount({ staffId: payload.staffId, username: payload.username, password: payload.password, whatsappPhone: payload.whatsappPhone, role: payload.staffId === "mustafa" ? "owner" : "staff" });
    return Response.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (["INVALID_USERNAME", "WEAK_PASSWORD", "USERNAME_TAKEN", "STAFF_NOT_FOUND"].includes(message)) return Response.json({ error: message }, { status: 400 });
    return apiError(error);
  }
}
