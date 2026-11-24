import { getEnv } from "@/lib/env";

/** Serves uploaded images/videos from R2, with Range support for video. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!/^[a-z0-9-]+\/[A-Za-z0-9-]+(\.[a-z0-9]+)?$/.test(key)) return new Response("Not found", { status: 404 });
  const bucket = getEnv().MEDIA;

  const range = req.headers.get("Range");
  let r2range: R2Range | undefined;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      if (m[1] === "" && m[2] !== "") r2range = { suffix: Number(m[2]) };
      else if (m[2] === "") r2range = { offset: Number(m[1]) };
      else r2range = { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
    }
  }

  const obj = await bucket.get(key, r2range ? { range: r2range } : undefined);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  if (r2range && obj.range) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number };
    const start = r.suffix !== undefined ? obj.size - r.suffix : (r.offset ?? 0);
    const len = r.suffix !== undefined ? r.suffix : (r.length ?? obj.size - start);
    headers.set("Content-Range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set("Content-Length", String(len));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { headers });
}
