import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { assertOwner, assertSameOrigin, saveStaffAccount } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await assertOwner();
    await ensureCatalogSeed();
    const existing = await getD1().prepare("SELECT id FROM staff_accounts WHERE staff_id = 'mustafa' LIMIT 1").first<{ id: string }>();
    if (existing) return Response.json({ error: "BOOTSTRAP_CLOSED" }, { status: 409 });
    const payload = await request.json() as { username?: string; password?: string; whatsappPhone?: string };
    if (!payload.username || !payload.password) return Response.json({ error: "CREDENTIALS_REQUIRED" }, { status: 400 });
    const account = await saveStaffAccount({ staffId: "mustafa", username: payload.username, password: payload.password, whatsappPhone: payload.whatsappPhone, role: "owner" });
    return Response.json({ account });
  } catch (error) {
    return apiError(error);
  }
}
