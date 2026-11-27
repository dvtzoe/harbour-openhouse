import { db, getSetting } from "./db";
import { DEFAULT_SHARE, act1Items, majors, mediaUrl, seniors, type ShareConfig } from "./guests";
import { getOverrides } from "./i18n/server";

export async function adminData() {
  const d = await db();
  const items = await act1Items();
  const { results: brands } = await d.prepare("SELECT id, name, hex, enabled FROM brands ORDER BY name").all<{
    id: string;
    name: string;
    hex: string;
    enabled: number;
  }>();
  const { results: ads } = await d
    .prepare("SELECT id, video_key, title FROM ads ORDER BY created_at DESC")
    .all<{ id: string; video_key: string; title: string }>();
  const { results: guests } = await d
    .prepare(
      `SELECT g.id, g.name, g.code, g.hidden, g.started_at, m.name AS major,
              COUNT(r.activity) AS done,
              CASE WHEN COUNT(r.activity) = 4 THEN SUM(r.finished_at - g.started_at) END AS total
       FROM guests g LEFT JOIN results r ON r.guest_id = g.id LEFT JOIN majors m ON m.id = g.major_id
       GROUP BY g.id ORDER BY g.started_at DESC LIMIT 500`,
    )
    .all<{
      id: string;
      name: string;
      code: string;
      hidden: number;
      started_at: number;
      major: string | null;
      done: number;
      total: number | null;
    }>();

  return {
    act1: items.map((i) => ({ id: i.id, position: i.position, answer: i.answer, url: mediaUrl(i.image_key) })),
    brands,
    majors: await majors(),
    seniors: await seniors(),
    share: await getSetting<ShareConfig>("share", DEFAULT_SHARE),
    ads: ads.map((a) => ({ id: a.id, title: a.title, url: mediaUrl(a.video_key) })),
    guests,
    /** Translation edits made in admin (key → text per locale); the JSON defaults ship with the client. */
    i18n: await getOverrides(),
  };
}

export type AdminData = Awaited<ReturnType<typeof adminData>>;
