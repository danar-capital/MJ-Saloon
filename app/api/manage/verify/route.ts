import { apiError, bookingDetails, createManageSession } from "@/lib/booking-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { challengeId?: string; code?: string };
    if (!payload.challengeId || !payload.code) return Response.json({ error: "OTP_INVALID" }, { status: 400 });
    const session = await createManageSession(payload.challengeId, payload.code);
    const details = await bookingDetails(session.bookingId);
    return Response.json({ session: { token: session.token, expiresAt: session.expiresAt }, details });
  } catch (error) {
    return apiError(error);
  }
}
