import { apiError, getPublicCatalog } from "@/lib/booking-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getPublicCatalog(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
