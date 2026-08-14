import { clearStaffSessionCookie, logoutStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await logoutStaff(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearStaffSessionCookie(), "Cache-Control": "no-store" } });
}
