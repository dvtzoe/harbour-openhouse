import { isStaff, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/guests";

export const dynamic = "force-dynamic";

/** A random ad for the station's penalty screen (null when none uploaded). */
export async function GET() {
  if (!(await isStaff())) return unauthorized();
  const ad = await (await db())
    .prepare("SELECT video_key, title FROM ads ORDER BY RANDOM() LIMIT 1")
    .first<{ video_key: string; title: string }>();
  return Response.json({ ad: ad ? { url: mediaUrl(ad.video_key), title: ad.title } : null });
}
