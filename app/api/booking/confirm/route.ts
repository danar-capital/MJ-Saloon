import { apiError, assertPublicRateLimit, createBooking, type GuestSelection } from "@/lib/booking-server";
import type { Locale } from "@/lib/booking-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      challengeId?: string;
      code?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      locale?: Locale;
      date?: string;
      startMinute?: number;
      guests?: GuestSelection[];
    };
    if (!payload.challengeId || !payload.code || !payload.firstName || !payload.lastName || !payload.phone || !payload.date || !Number.isInteger(payload.startMinute) || !payload.guests?.length || payload.guests.length > 6) {
      return Response.json({ error: "BOOKING_DETAILS_REQUIRED" }, { status: 400 });
    }
    await assertPublicRateLimit(request, "booking-confirm", payload.challengeId, 12, 10 * 60_000);
    const booking = await createBooking({
      challengeId: payload.challengeId,
      code: payload.code,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone,
      locale: payload.locale === "en" ? "en" : "ar",
      date: payload.date,
      startMinute: payload.startMinute!,
      guests: payload.guests,
    });
    return Response.json({ booking }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
