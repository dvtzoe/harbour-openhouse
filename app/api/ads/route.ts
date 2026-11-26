import { isStaff, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/guests";

export const dynamic = "force-dynamic";

/** Every uploaded ad, so the station can preload them all and pick one at random for its penalty screen. */
export async function GET() {
  if (!(await isStaff())) return unauthorized();
  const { results } = await (await db())
    .prepare("SELECT video_key, title FROM ads ORDER BY created_at DESC")
    .all<{ video_key: string; title: string }>();
  return Response.json({ ads: results.map((a) => ({ url: mediaUrl(a.video_key), title: a.title })) });
}
