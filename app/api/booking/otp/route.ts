import { apiError, createOtp } from "@/lib/booking-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { phone?: string };
    if (!payload.phone) return Response.json({ error: "INVALID_PHONE" }, { status: 400 });
    const challenge = await createOtp(payload.phone, "booking");
    return Response.json({ challenge });
  } catch (error) {
    return apiError(error);
  }
}
