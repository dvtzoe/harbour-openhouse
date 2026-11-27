"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/core";
import { useI18n } from "./i18n";

export { EVENT_NAME } from "@/lib/i18n/core";

export function Box({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`dos-box px-4 pb-4 pt-1 ${className}`}>
      {title ? <h2 className="dos-title text-base sm:text-lg">{title}</h2> : <div className="h-3" />}
      <div className="mt-1">{children}</div>
    </section>
  );
}

export function TopBar({ right }: { right?: ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="dos-bar flex flex-wrap items-center justify-between gap-x-4 px-3 py-1 text-sm font-bold">
      <span>{t("common.topBar")}</span>
      <span className="flex items-center gap-4">
        {right}
        <LangToggle />
      </span>
    </header>
  );
}

/**
 * EN | TH switch. Switches instantly (no reload) and remembers the choice in a cookie.
 * tabIndex -1 keeps it out of arrow-key navigation, so a stray arrow + ENTER at the station can't flip it.
 */
function LangToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <span role="group" aria-label={t("common.language")} className="flex">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          tabIndex={-1}
          lang={l}
          aria-pressed={l === locale}
          onClick={() => setLocale(l)}
          className={`px-1 ${l === locale ? "bg-dos-black text-dos-yellow" : "underline"}`}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </span>
  );
}

export function Key({ k }: { k: string }) {
  return <span className="text-dos-yellow">[{k}]</span>;
}

/** Key label for use inside a gray .dos-btn, where the yellow-on-blue <Key> would be unreadable. */
export function KeyCap({ k }: { k: string }) {
  return <kbd className="bg-dos-black px-1.5 font-bold text-dos-yellow">{k}</kbd>;
}

/**
 * Button that shows its pending look the instant it is clicked when `onClick` returns a promise
 * (e.g. a server call), until that promise settles. Non-promise returns (a cancelled confirm()) do nothing.
 */
export function AsyncButton({
  onClick,
  pendingText,
  className = "dos-btn",
  disabled,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & { onClick: () => unknown; pendingText?: ReactNode }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      {...rest}
      className={`${className}${pending ? " is-pending" : ""}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={() => {
        const r = onClick();
        if (r instanceof Promise) {
          setPending(true);
          r.finally(() => setPending(false));
        }
      }}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
