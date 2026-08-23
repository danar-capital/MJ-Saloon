import { env } from "cloudflare:workers";
import { apiError, ensureCatalogSeed, getD1 } from "@/lib/booking-server";
import { assertSameOrigin, requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function authorizedTarget(request: Request, requestedId: string | null) {
  const viewer = await requireStaffSession(request);
  const staffId = requestedId?.trim() || viewer.staffId;
  if (!viewer.isOwner && staffId !== viewer.staffId) throw new Error("STAFF_UNAUTHORIZED");
  return { viewer, staffId };
}

export async function GET(request: Request) {
  try {
    await ensureCatalogSeed();
    const { staffId } = await authorizedTarget(request, new URL(request.url).searchParams.get("staffId"));
    const row = await getD1().prepare("SELECT profile_image_key FROM staff_members WHERE id = ?")
      .bind(staffId).first<{ profile_image_key: string | null }>();
    if (!row?.profile_image_key) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const object = await env.BUCKET.get(row.profile_image_key);
    if (!object) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const form = await request.formData();
    const requestedId = typeof form.get("staffId") === "string" ? String(form.get("staffId")) : null;
    const { staffId } = await authorizedTarget(request, requestedId);
    const file = form.get("image");
    if (!(file instanceof File)) return Response.json({ error: "PROFILE_IMAGE_REQUIRED" }, { status: 400 });
    const extension = allowedTypes.get(file.type);
    if (!extension || file.size < 1 || file.size > 5 * 1024 * 1024) return Response.json({ error: "INVALID_PROFILE_IMAGE" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = file.type === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = file.type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!isJpeg && !isPng && !isWebp) return Response.json({ error: "INVALID_PROFILE_IMAGE" }, { status: 400 });
    await ensureCatalogSeed();
    const db = getD1();
    const current = await db.prepare("SELECT profile_image_key FROM staff_members WHERE id = ?")
      .bind(staffId).first<{ profile_image_key: string | null }>();
    if (!current) return Response.json({ error: "STAFF_NOT_FOUND" }, { status: 404 });
    const key = `staff-profiles/${staffId}/${crypto.randomUUID()}.${extension}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: file.type } });
    const version = new Date().toISOString();
    await db.prepare("UPDATE staff_members SET profile_image_key = ?, profile_image_updated_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(key, version, staffId).run();
    if (current.profile_image_key && current.profile_image_key !== key) await env.BUCKET.delete(current.profile_image_key).catch(() => undefined);
    return Response.json({ image: { staffId, version } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
