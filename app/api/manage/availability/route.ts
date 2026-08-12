import { apiError, bookingDetails, findAvailability, requireManageSession } from "@/lib/booking-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const session = await requireManageSession(token);
    const payload = await request.json() as { date?: string };
    if (!payload.date) return Response.json({ error: "NEW_SLOT_REQUIRED" }, { status: 400 });
    const details = await bookingDetails(session.booking_id);
    const guests = (details.items as Array<{ service_id: string; staff_id: string; guest_label: string }>).map((item) => ({ serviceId: item.service_id, staffId: item.staff_id, label: item.guest_label }));
    const slots = await findAvailability(payload.date, guests, session.booking_id);
    return Response.json({ slots });
  } catch (error) {
    return apiError(error);
  }
}
