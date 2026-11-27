import { adminData } from "@/lib/admin";
import { isStaff, unauthorized } from "@/lib/auth";
import { db, setSetting } from "@/lib/db";
import { DEFAULTS, isKey, isLocale } from "@/lib/i18n/core";
import { overrideKey } from "@/lib/i18n/server";
import { getEnv } from "@/lib/env";
import { bad, jsonBody } from "@/lib/http";
import { broadcast } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isStaff())) return unauthorized();
  return Response.json(await adminData());
}

type Action =
  | { action: "act1.update"; id: string; answer: string }
  | { action: "act1.move"; id: string; dir: -1 | 1 }
  | { action: "act1.delete"; id: string }
  | { action: "brand.add"; name: string; hex: string }
  | { action: "brand.update"; id: string; name: string; hex: string; enabled: boolean }
  | { action: "brand.delete"; id: string }
  | { action: "major.add"; name: string }
  | { action: "major.update"; id: string; name: string }
  | { action: "major.move"; id: string; dir: -1 | 1 }
  | { action: "major.delete"; id: string }
  | { action: "senior.add"; name: string; majorId: string }
  | { action: "senior.update"; id: string; name: string; majorId: string }
  | { action: "senior.delete"; id: string }
  | { action: "share.set"; tag: string }
  | { action: "ad.delete"; id: string }
  | { action: "guest.hide"; id: string; hidden: boolean }
  | { action: "guest.delete"; id: string }
  | { action: "reset.all"; confirm: string }
  /** Empty text, or text equal to the JSON default, removes the override. */
  | { action: "i18n.set"; locale: string; key: string; value: string };

const HEX = /^#[0-9A-Fa-f]{6}$/;
const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

export async function POST(req: Request) {
  if (!(await isStaff())) return unauthorized();
  const b = await jsonBody<Action>(req);
  if (!b) return bad("errors.badRequest");
  const d = await db();
  const bucket = getEnv().MEDIA;

  switch (b.action) {
    case "act1.update": {
      if (!letters(b.answer)) return bad("errors.answerLetters");
      await d.prepare("UPDATE act1_items SET answer = ? WHERE id = ?").bind(letters(b.answer), b.id).run();
      break;
    }
    case "act1.move": {
      const { results } = await d.prepare("SELECT id FROM act1_items ORDER BY position, id").all<{ id: string }>();
      const ids = results.map((r) => r.id);
      const i = ids.indexOf(b.id);
      const j = i + b.dir;
      if (i < 0 || j < 0 || j >= ids.length) break;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await d.batch(ids.map((id, pos) => d.prepare("UPDATE act1_items SET position = ? WHERE id = ?").bind(pos, id)));
      break;
    }
    case "act1.delete": {
      const row = await d.prepare("SELECT image_key FROM act1_items WHERE id = ?").bind(b.id).first<{ image_key: string }>();
      if (row) {
        await d.prepare("DELETE FROM act1_items WHERE id = ?").bind(b.id).run();
        await bucket.delete(row.image_key);
      }
      break;
    }
    case "brand.add":
    case "brand.update": {
      const name = (b.name ?? "").trim();
      if (!name || name.length > 40) return bad("errors.brandName");
      if (!HEX.test(b.hex)) return bad("errors.hex");
      if (b.action === "brand.add") {
        await d.prepare("INSERT INTO brands (id, name, hex, enabled) VALUES (?, ?, ?, 1)").bind(crypto.randomUUID(), name, b.hex.toUpperCase()).run();
      } else {
        await d
          .prepare("UPDATE brands SET name = ?, hex = ?, enabled = ? WHERE id = ?")
          .bind(name, b.hex.toUpperCase(), b.enabled ? 1 : 0, b.id)
          .run();
      }
      break;
    }
    case "brand.delete":
      await d.prepare("DELETE FROM brands WHERE id = ?").bind(b.id).run();
      break;
    case "major.add":
    case "major.update": {
      const name = (b.name ?? "").trim();
      if (!name || name.length > 40) return bad("errors.majorName");
      if (b.action === "major.add") {
        // The station picks answers with keys 1–9.
        const count = await d.prepare("SELECT COUNT(*) AS n FROM majors").first<{ n: number }>();
        if ((count?.n ?? 0) >= 9) return bad("errors.maxMajors");
        await d
          .prepare("INSERT INTO majors (id, position, name) VALUES (?, (SELECT COALESCE(MAX(position), -1) + 1 FROM majors), ?)")
          .bind(crypto.randomUUID(), name)
          .run();
      } else {
        await d.prepare("UPDATE majors SET name = ? WHERE id = ?").bind(name, b.id).run();
      }
      break;
    }
    case "major.move": {
      const { results } = await d.prepare("SELECT id FROM majors ORDER BY position, id").all<{ id: string }>();
      const ids = results.map((r) => r.id);
      const i = ids.indexOf(b.id);
      const j = i + b.dir;
      if (i < 0 || j < 0 || j >= ids.length) break;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await d.batch(ids.map((id, pos) => d.prepare("UPDATE majors SET position = ? WHERE id = ?").bind(pos, id)));
      break;
    }
    case "major.delete": {
      const count = await d.prepare("SELECT COUNT(*) AS n FROM majors").first<{ n: number }>();
      if ((count?.n ?? 0) <= 2) return bad("errors.minMajors");
      // Its seniors go too; players who picked it fall back to any senior.
      await d.batch([
        d.prepare("DELETE FROM seniors WHERE major_id = ?").bind(b.id),
        d.prepare("DELETE FROM majors WHERE id = ?").bind(b.id),
      ]);
      break;
    }
    case "senior.add":
    case "senior.update": {
      const name = (b.name ?? "").trim();
      if (!name || name.length > 40) return bad("errors.seniorName");
      if (!(await d.prepare("SELECT 1 FROM majors WHERE id = ?").bind(b.majorId ?? "").first())) return bad("errors.seniorMajor");
      if (b.action === "senior.add") {
        await d.prepare("INSERT INTO seniors (id, name, major_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), name, b.majorId).run();
      } else {
        await d.prepare("UPDATE seniors SET name = ?, major_id = ? WHERE id = ?").bind(name, b.majorId, b.id).run();
      }
      break;
    }
    case "senior.delete":
      await d.prepare("DELETE FROM seniors WHERE id = ?").bind(b.id).run();
      break;
    case "share.set": {
      const tag = String(b.tag ?? "").trim();
      if (tag.length > 80) return bad("errors.maxChars", 400, { n: 80 });
      await setSetting("share", { tag });
      break;
    }
    case "ad.delete": {
      const row = await d.prepare("SELECT video_key FROM ads WHERE id = ?").bind(b.id).first<{ video_key: string }>();
      if (row) {
        await d.prepare("DELETE FROM ads WHERE id = ?").bind(b.id).run();
        await bucket.delete(row.video_key);
      }
      break;
    }
    case "guest.hide":
      await d.prepare("UPDATE guests SET hidden = ? WHERE id = ?").bind(b.hidden ? 1 : 0, b.id).run();
      await broadcast("leaderboard");
      break;
    case "guest.delete":
      await d.batch([
        d.prepare("DELETE FROM results WHERE guest_id = ?").bind(b.id),
        d.prepare("DELETE FROM guests WHERE id = ?").bind(b.id),
      ]);
      await broadcast("leaderboard", `guest:${b.id}`);
      break;
    case "reset.all":
      if (b.confirm !== "RESET") return bad("errors.typeReset");
      await d.batch([d.prepare("DELETE FROM results"), d.prepare("DELETE FROM guests")]);
      await broadcast("leaderboard");
      break;
    case "i18n.set": {
      if (!isLocale(b.locale) || !isKey(b.key)) return bad("errors.unknownKey");
      const value = typeof b.value === "string" ? b.value : "";
      if (value.length > 2000) return bad("errors.textTooLong");
      const k = overrideKey(b.locale, b.key);
      if (!value.trim() || value === DEFAULTS[b.locale][b.key]) await d.prepare("DELETE FROM settings WHERE key = ?").bind(k).run();
      else await setSetting(k, value);
      break;
    }
    default:
      return bad("errors.unknownAction");
  }
  return Response.json(await adminData());
}
