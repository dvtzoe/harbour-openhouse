import { getEnv } from "./env";
import { DEFAULT_BRANDS } from "./default-brands";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS guests (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    code TEXT NOT NULL UNIQUE,
    started_at INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    act1_progress INTEGER NOT NULL DEFAULT 0,
    act2_state TEXT NOT NULL,
    act3_state TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS results (
    guest_id TEXT NOT NULL,
    activity INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    PRIMARY KEY (guest_id, activity)
  )`,
  `CREATE TABLE IF NOT EXISTS act1_items (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    image_key TEXT NOT NULL,
    answer TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hex TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS ads (
    id TEXT PRIMARY KEY,
    video_key TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

let ready: Promise<void> | null = null;

async function init(db: D1Database) {
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  const seeded = await db.prepare("SELECT value FROM settings WHERE key = 'seeded'").first();
  if (!seeded) {
    const stmts = DEFAULT_BRANDS.map((b) =>
      db
        .prepare("INSERT INTO brands (id, name, hex, enabled) VALUES (?, ?, ?, 1)")
        .bind(crypto.randomUUID(), b.name, b.hex),
    );
    stmts.push(db.prepare("INSERT INTO settings (key, value) VALUES ('seeded', '1')"));
    await db.batch(stmts);
  }
}

/** D1 handle with the schema guaranteed to exist (checked once per isolate). */
export async function db(): Promise<D1Database> {
  const d = getEnv().DB;
  if (!ready) {
    ready = init(d).catch((e) => {
      ready = null;
      throw e;
    });
  }
  await ready;
  return d;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await (await db()).prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await (await db())
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, JSON.stringify(value))
    .run();
}
