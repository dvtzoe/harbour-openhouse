import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { db, getSetting } from "./db";
import { freshAct2, ACT2_MAX_GUESSES, ACT2_MIN, ACT2_MAX, type Act2State } from "./game/act2";
import { freshAct3, ACT3_BRANDS_PER_ROUND, type Act3State } from "./game/act3";
import { currentTask, taskStart } from "./tasks";

export const ACTIVITIES = [1, 2, 3, 4] as const;
export type ActivityId = (typeof ACTIVITIES)[number];

export const ACTIVITY_NAMES: Record<ActivityId, string> = {
  1: "DECODE.EXE",
  2: "BINSRCH.EXE",
  3: "COLORS.EXE",
  4: "ASKAROUND.EXE",
};

export interface GuestRow {
  id: string;
  token: string;
  name: string;
  code: string;
  started_at: number;
  hidden: number;
  act1_progress: number;
  act2_state: string;
  act3_state: string;
  /** The activity 1 image picked for this guest (null until first shown). */
  act1_item: string | null;
}

export interface Act4Config {
  question: string;
  options: string[];
  correct: number;
}

export const DEFAULT_ACT4: Act4Config = {
  question: "(Staff: set the activity 4 question on /admin)",
  options: ["Option A", "Option B", "Option C", "Option D"],
  correct: 0,
};

// No 0/O, 1/I/L — easy to read off a phone and type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

export function validateName(raw: string): { name?: string; error?: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 16) return { error: "Name must be 2–16 characters." };
  if (!/^[A-Za-z0-9 _.\-]+$/.test(name)) return { error: "Use letters, numbers, space, _ . - only." };
  if (matcher.hasMatch(name)) return { error: "Please choose a different name." };
  return { name };
}

export async function enabledBrands() {
  const { results } = await (await db())
    .prepare("SELECT id, name, hex FROM brands WHERE enabled = 1")
    .all<{ id: string; name: string; hex: string }>();
  return results;
}

export async function newAct3State(): Promise<Act3State> {
  return freshAct3(await enabledBrands());
}

export async function registerGuest(rawName: string): Promise<{ guest?: GuestRow; error?: string }> {
  const { name, error } = validateName(rawName);
  if (error || !name) return { error };
  const d = await db();
  const taken = await d.prepare("SELECT 1 FROM guests WHERE name = ?").bind(name).first();
  if (taken) return { error: "That name is taken — pick another." };

  for (let attempt = 0; attempt < 8; attempt++) {
    const guest: GuestRow = {
      id: crypto.randomUUID(),
      token: crypto.randomUUID() + crypto.randomUUID(),
      name,
      code: randomCode(),
      started_at: Date.now(),
      hidden: 0,
      act1_progress: 0,
      act2_state: JSON.stringify(freshAct2()),
      act3_state: JSON.stringify(await newAct3State()),
      act1_item: null,
    };
    try {
      await d
        .prepare(
          `INSERT INTO guests (id, token, name, code, started_at, hidden, act1_progress, act2_state, act3_state)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        )
        .bind(guest.id, guest.token, guest.name, guest.code, guest.started_at, guest.act2_state, guest.act3_state)
        .run();
      return { guest };
    } catch (e) {
      const msg = String(e);
      if (msg.includes("guests.name")) return { error: "That name is taken — pick another." };
      if (!msg.includes("guests.code")) throw e;
      // code collision: retry with a new code
    }
  }
  return { error: "Could not register, please try again." };
}

export async function guestByToken(token: string | undefined) {
  if (!token) return null;
  return (await db()).prepare("SELECT * FROM guests WHERE token = ?").bind(token).first<GuestRow>();
}

export async function guestByCode(code: string) {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(c)) return null;
  return (await db()).prepare("SELECT * FROM guests WHERE code = ?").bind(c).first<GuestRow>();
}

/** Same as finishedMap, but keyed by guest code so it can run alongside guestByCode. */
export async function finishedMapByCode(code: string): Promise<Partial<Record<ActivityId, number>>> {
  const { results } = await (await db())
    .prepare("SELECT activity, finished_at FROM results WHERE guest_id = (SELECT id FROM guests WHERE code = ?)")
    .bind(code.trim().toUpperCase())
    .all<{ activity: ActivityId; finished_at: number }>();
  return Object.fromEntries(results.map((r) => [r.activity, r.finished_at]));
}

export async function finishedMap(guestId: string): Promise<Partial<Record<ActivityId, number>>> {
  const { results } = await (await db())
    .prepare("SELECT activity, finished_at FROM results WHERE guest_id = ?")
    .bind(guestId)
    .all<{ activity: ActivityId; finished_at: number }>();
  return Object.fromEntries(results.map((r) => [r.activity, r.finished_at]));
}

/** Records completion once; returns false if it was already done. */
export async function markFinished(guestId: string, activity: ActivityId) {
  const r = await (await db())
    .prepare("INSERT OR IGNORE INTO results (guest_id, activity, finished_at) VALUES (?, ?, ?)")
    .bind(guestId, activity, Date.now())
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function act1Items() {
  const { results } = await (await db())
    .prepare("SELECT id, position, image_key, answer FROM act1_items ORDER BY position, id")
    .all<{ id: string; position: number; image_key: string; answer: string }>();
  return results;
}

/**
 * The one activity 1 image this guest must decode. Picked at random the first
 * time it is needed, then kept (also across wrong answers). If staff delete
 * the picked image, a new one is picked.
 */
export async function act1ItemFor(g: GuestRow) {
  const items = await act1Items();
  const kept = items.find((i) => i.id === g.act1_item);
  if (kept || items.length === 0) return kept ?? null;
  const pick = items[Math.floor(Math.random() * items.length)];
  const d = await db();
  // Only replace what we saw, so a concurrent pick (phone vs station) wins once.
  await d
    .prepare("UPDATE guests SET act1_item = ? WHERE id = ? AND act1_item IS ?")
    .bind(pick.id, g.id, g.act1_item)
    .run();
  const row = await d.prepare("SELECT act1_item FROM guests WHERE id = ?").bind(g.id).first<{ act1_item: string | null }>();
  g.act1_item = row?.act1_item ?? pick.id;
  return items.find((i) => i.id === g.act1_item) ?? pick;
}

export const mediaUrl = (key: string) => `/media/${key}`;

/**
 * Everything a guest's phone needs (no answers). Tasks are solved in order,
 * so only the current task's details are sent; later tasks stay hidden.
 */
export async function guestView(g: GuestRow, knownFinished?: Partial<Record<ActivityId, number>>) {
  const finished = knownFinished ?? (await finishedMap(g.id));
  const current = currentTask(finished);

  let act1 = null;
  if (current === 1) {
    const item = await act1ItemFor(g);
    act1 = { image: item ? mediaUrl(item.image_key) : null };
  }
  const act2 =
    current === 2
      ? { min: ACT2_MIN, max: ACT2_MAX, maxGuesses: ACT2_MAX_GUESSES, guesses: (JSON.parse(g.act2_state) as Act2State).guesses }
      : null;
  let act3 = null;
  if (current === 3) {
    const st = JSON.parse(g.act3_state) as Act3State;
    act3 = { brands: st.rounds.map((r) => r.name), index: st.index, perRound: ACT3_BRANDS_PER_ROUND };
  }
  let act4 = null;
  if (current === 4) {
    const cfg = await getSetting<Act4Config>("act4", DEFAULT_ACT4);
    act4 = { question: cfg.question, options: cfg.options };
  }

  return {
    id: g.id,
    name: g.name,
    code: g.code,
    startedAt: g.started_at,
    serverNow: Date.now(),
    finished,
    /** The task to solve now, or null when all 4 are done. */
    current,
    /** When the current task's timer started (null when all done). */
    currentStartedAt: current ? taskStart(g.started_at, finished, current) : null,
    act1,
    act2,
    act3,
    act4,
  };
}

export type GuestView = Awaited<ReturnType<typeof guestView>>;

/** Station view: phone view plus what the station must render for 1 and 3. */
export async function stationView(g: GuestRow, knownFinished?: Partial<Record<ActivityId, number>>) {
  const base = await guestView(g, knownFinished);
  const act3 = JSON.parse(g.act3_state) as Act3State;
  const round = base.current === 3 ? act3.rounds[act3.index] : undefined;
  return {
    ...base,
    act3Round: round ? { name: round.name, options: round.options, index: act3.index, total: act3.rounds.length } : null,
  };
}

export type StationView = Awaited<ReturnType<typeof stationView>>;
