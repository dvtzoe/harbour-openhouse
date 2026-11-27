import { cookies, headers } from "next/headers";
import { db } from "../db";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  fromAcceptLanguage,
  isKey,
  isLocale,
  mergeMessages,
  translate,
  type Locale,
  type MessageKey,
  type Overrides,
  type Vars,
} from "./core";

/** Admin overrides are stored one per row in `settings`, as key "i18n:<locale>:<message key>". */
const PREFIX = "i18n:";
export const overrideKey = (locale: Locale, key: MessageKey) => `${PREFIX}${locale}:${key}`;

/** The viewer's language: the EN/TH toggle's cookie, else the browser's language, else English. */
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return fromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}

export async function getOverrides(): Promise<Overrides> {
  const { results } = await (await db())
    .prepare("SELECT key, value FROM settings WHERE key LIKE 'i18n:%'")
    .all<{ key: string; value: string }>();
  const out = Object.fromEntries(LOCALES.map((l) => [l, {}])) as Overrides;
  for (const row of results) {
    const rest = row.key.slice(PREFIX.length);
    const i = rest.indexOf(":");
    const locale = rest.slice(0, i);
    const key = rest.slice(i + 1);
    if (!isLocale(locale) || !isKey(key)) continue; // a key that was removed from en.json
    try {
      out[locale][key] = JSON.parse(row.value) as string;
    } catch {
      // ignore a malformed row
    }
  }
  return out;
}

/** All locales' texts (JSON files + admin overrides). */
export async function getMessages() {
  return mergeMessages(await getOverrides());
}

/** A translate function for the current request's language. */
export async function serverT() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (key: MessageKey, vars?: Vars) => translate(messages, locale, key, vars);
}
