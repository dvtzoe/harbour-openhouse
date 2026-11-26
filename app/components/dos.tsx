"use client";

import type { ReactNode } from "react";

export const EVENT_NAME = "Harbour.Space@UTCC";

export function Box({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`dos-box px-4 pb-4 pt-1 ${className}`}>
      {title ? <h2 className="dos-title text-base sm:text-lg">{title}</h2> : <div className="h-3" />}
      <div className="mt-1">{children}</div>
    </section>
  );
}

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="dos-bar flex items-center justify-between px-3 py-1 text-sm font-bold">
      <span>★ {EVENT_NAME} OPEN HOUSE ★</span>
      <span>{right}</span>
    </header>
  );
}

export function Key({ k }: { k: string }) {
  return <span className="text-dos-yellow">[{k}]</span>;
}

/** Key label for use inside a gray .dos-btn, where the yellow-on-blue <Key> would be unreadable. */
export function KeyCap({ k }: { k: string }) {
  return <kbd className="bg-dos-black px-1.5 font-bold text-dos-yellow">{k}</kbd>;
}
