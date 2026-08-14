import { apiError } from "@/lib/booking-server";
import { assertOwner, saveStaffAccount } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertOwner();
    const payload = await request.json() as { username?: string; password?: string; whatsappPhone?: string };
    if (!payload.username || !payload.password) return Response.json({ error: "CREDENTIALS_REQUIRED" }, { status: 400 });
    const account = await saveStaffAccount({ staffId: "mustafa", username: payload.username, password: payload.password, whatsappPhone: payload.whatsappPhone, role: "owner" });
    return Response.json({ account });
  } catch (error) {
    return apiError(error);
  }
}
