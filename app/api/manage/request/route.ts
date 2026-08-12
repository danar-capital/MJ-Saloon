import { apiError, createChangeRequest } from "@/lib/booking-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const sessionToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const payload = await request.json() as { type?: "cancel" | "reschedule"; date?: string; startMinute?: number };
    if (payload.type !== "cancel" && payload.type !== "reschedule") return Response.json({ error: "REQUEST_TYPE_REQUIRED" }, { status: 400 });
    const result = await createChangeRequest({ sessionToken, type: payload.type, date: payload.date, startMinute: payload.startMinute });
    return Response.json({ request: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
