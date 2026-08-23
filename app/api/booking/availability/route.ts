import { apiError, assertPublicRateLimit, findAvailability, type GuestSelection } from "@/lib/booking-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { date?: string; guests?: GuestSelection[] };
    if (!payload.date || !Array.isArray(payload.guests) || !payload.guests.length || payload.guests.length > 6) {
      return Response.json({ error: "BOOKING_SELECTION_REQUIRED" }, { status: 400 });
    }
    await assertPublicRateLimit(request, "booking-availability", "all", 90, 60_000);
    const slots = await findAvailability(payload.date, payload.guests);
    return Response.json({ slots }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
