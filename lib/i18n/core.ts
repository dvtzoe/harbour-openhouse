// Pure i18n helpers shared by server and client (no DB or React imports).
// The texts live in messages/<locale>.json; staff can override any of them in /admin (see lib/i18n/server.ts).
import en from "@/messages/en.json";
import th from "@/messages/th.json";

export const LOCALES = ["en", "th"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "hs_lang";
export const LOCALE_LABELS: Record<Locale, string> = { en: "EN", th: "TH" };

/** Shown in many texts as {event}; a brand name, so not translated. */
export const EVENT_NAME = "Harbour.Space@UTCC";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every text key, e.g. "play.start". en.json is the source of truth for which keys exist. */
export type MessageKey = Leaves<typeof en>;
/** key → text for one locale. */
export type Messages = Record<string, string>;
export type Vars = Record<string, string | number>;

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

/** { a: { b: "x" } } → { "a.b": "x" } */
export function flatten(obj: Record<string, unknown>, prefix = "", out: Messages = {}): Messages {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[prefix + k] = v;
    else if (v && typeof v === "object") flatten(v as Record<string, unknown>, `${prefix}${k}.`, out);
  }
  return out;
}

/** { "a.b": "x" } → { a: { b: "x" } } (for downloading an edited messages file). */
export function unflatten(flat: Messages): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(flat)) {
    const parts = key.split(".");
    let node = out;
    for (const p of parts.slice(0, -1)) node = (node[p] ??= {}) as Record<string, unknown>;
    node[parts.at(-1)!] = v;
  }
  return out;
}

/** The texts from the JSON files, before admin overrides. */
export const DEFAULTS: Record<Locale, Messages> = { en: flatten(en), th: flatten(th) };
export const KEYS = Object.keys(DEFAULTS.en) as MessageKey[];
export const isKey = (k: unknown): k is MessageKey => typeof k === "string" && k in DEFAULTS.en;

/** Admin edits per locale: key → text. */
export type Overrides = Record<Locale, Messages>;

/** JSON defaults with admin overrides on top. */
export function mergeMessages(overrides: Partial<Overrides>): Record<Locale, Messages> {
  const out = {} as Record<Locale, Messages>;
  for (const l of LOCALES) out[l] = { ...DEFAULTS[l], ...overrides[l] };
  return out;
}

/** Replaces {name} placeholders. {event} is always available. Unknown placeholders are left as-is. */
export function format(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = k in vars ? vars[k] : k === "event" ? EVENT_NAME : undefined;
    return v === undefined ? m : String(v);
  });
}

/** The text for `key` in `locale`, falling back to English, then to the key itself. */
export function translate(messages: Record<Locale, Messages>, locale: Locale, key: MessageKey, vars?: Vars): string {
  return format(messages[locale]?.[key] || messages.en?.[key] || DEFAULTS.en[key] || key, vars);
}

/** Picks a supported locale from an Accept-Language header, e.g. "th-TH,th;q=0.9,en;q=0.8" → "th". */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const langs = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q);
  return langs.map((x) => x.lang).find(isLocale) ?? null;
}
