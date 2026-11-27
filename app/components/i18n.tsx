"use client";

import { createContext, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  LOCALE_COOKIE,
  format,
  translate,
  type Locale,
  type MessageKey,
  type Messages,
  type Vars,
} from "@/lib/i18n/core";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Like t(), but turns <y>…</y>, <em>…</em> and <b>…</b> in the text into styled elements. */
  rich: (key: MessageKey, vars?: Vars) => ReactNode;
};

const I18nContext = createContext<Ctx | null>(null);

/** For code outside React (api() errors): the texts and language the provider last rendered with. */
let current: { messages: Record<Locale, Messages>; locale: Locale } | null = null;
export function tOutside(key: MessageKey, vars?: Vars) {
  return current ? translate(current.messages, current.locale, key, vars) : format(key, vars);
}

const TAGS: Record<string, (children: ReactNode, key: number) => ReactNode> = {
  y: (c, k) => (
    <span key={k} className="text-dos-yellow">
      {c}
    </span>
  ),
  em: (c, k) => <em key={k}>{c}</em>,
  b: (c, k) => <strong key={k}>{c}</strong>,
};

function renderRich(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tag = TAGS[m[1]];
    if (!tag) continue; // unknown tag: left as plain text
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(tag(m[2], parts.length));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}

export function I18nProvider({
  initialLocale,
  messages,
  children,
}: {
  initialLocale: Locale;
  /** Every locale is sent so switching language is instant (no reload, so the station keeps its state). */
  messages: Record<Locale, Messages>;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState(initialLocale);
  current = { messages, locale };

  const setLocale = useCallback((l: Locale) => {
    // Not HttpOnly: set here so API error messages come back in the new language too.
    document.cookie = `${LOCALE_COOKIE}=${l}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    document.documentElement.lang = l;
    setLocaleState(l);
  }, []);

  const value = useMemo<Ctx>(() => {
    const t = (key: MessageKey, vars?: Vars) => translate(messages, locale, key, vars);
    return { locale, setLocale, t, rich: (key, vars) => renderRich(t(key, vars)) };
  }, [messages, locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n needs <I18nProvider>");
  return ctx;
}
