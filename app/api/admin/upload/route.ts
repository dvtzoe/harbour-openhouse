import { adminData } from "@/lib/admin";
import { isStaff, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { bad } from "@/lib/http";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** multipart: kind=act1 (file, answer) | kind=ad (file, title) */
export async function POST(req: Request) {
  if (!(await isStaff())) return unauthorized();
  const form = await req.formData();
  const kind = form.get("kind");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return bad("errors.chooseFile");
  const ext = EXT[file.type];
  if (!ext) return bad("errors.unsupportedType", 400, { type: file.type || "(?)" });

  const d = await db();
  const bucket = getEnv().MEDIA;
  const id = crypto.randomUUID();

  if (kind === "act1") {
    if (!file.type.startsWith("image/")) return bad("errors.act1NeedsImage");
    const answer = String(form.get("answer") ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!answer) return bad("errors.answerLetters");
    const key = `act1/${id}.${ext}`;
    await bucket.put(key, file.stream().pipeThrough(new FixedLengthStream(file.size)), { httpMetadata: { contentType: file.type } });
    const max = await d.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM act1_items").first<{ m: number }>();
    await d.prepare("INSERT INTO act1_items (id, position, image_key, answer) VALUES (?, ?, ?, ?)").bind(id, (max?.m ?? -1) + 1, key, answer).run();
  } else if (kind === "ad") {
    if (!file.type.startsWith("video/")) return bad("errors.adsVideo");
    const title = String(form.get("title") ?? "").trim() || file.name;
    const key = `ads/${id}.${ext}`;
    await bucket.put(key, file.stream().pipeThrough(new FixedLengthStream(file.size)), { httpMetadata: { contentType: file.type } });
    await d.prepare("INSERT INTO ads (id, video_key, title, created_at) VALUES (?, ?, ?, ?)").bind(id, key, title, Date.now()).run();
  } else {
    return bad("errors.unknownUpload");
  }
  return Response.json(await adminData());
}
