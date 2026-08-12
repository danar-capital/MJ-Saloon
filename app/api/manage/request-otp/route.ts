import { apiError, createOtp, getBookingByManageToken } from "@/lib/booking-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { manageToken?: string };
    if (!payload.manageToken) return Response.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
    const booking = await getBookingByManageToken(payload.manageToken);
    if (!booking) return Response.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
    const challenge = await createOtp(booking.phone, "manage", booking.id);
    const maskedPhone = `+${booking.phone.slice(0, 4)} ••• ••${booking.phone.slice(-2)}`;
    return Response.json({ bookingCode: booking.booking_code, maskedPhone, challenge });
  } catch (error) {
    return apiError(error);
  }
}
