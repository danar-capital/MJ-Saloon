import { getStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getStaffSession(request);
  return viewer
    ? Response.json({ viewer }, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "STAFF_UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
