import { apiError, bookingDetails, requireManageSession } from "@/lib/booking-server";

export const dynamic = "force-dynamic";

function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

export async function GET(request: Request) {
  try {
    const session = await requireManageSession(bearer(request));
    return Response.json(await bookingDetails(session.booking_id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
