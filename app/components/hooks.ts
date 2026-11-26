"use client";

import { useEffect, useRef, useState } from "react";

/** Subscribe to LiveHub signals for a topic; calls onChange on every push and on reconnect. */
export function useLive(topic: string | null, onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!topic) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/ws?topic=${encodeURIComponent(topic)}`);
      ws.onopen = () => {
        if (retry > 0) cb.current(); // catch up on anything missed while offline
        retry = 0;
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 30_000);
      };
      ws.onmessage = (e) => {
        if (e.data !== "pong") cb.current();
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (closed) return;
        retry++;
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** retry));
      };
    };
    connect();
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(timer);
      ws?.close();
    };
  }, [topic]);
}

/** Re-render every `ms` and return Date.now() corrected by a server offset. */
export function useNow(offsetMs = 0, ms = 100) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetMs), ms);
    return () => clearInterval(id);
  }, [offsetMs, ms]);
  return now;
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/**
 * Keeps typing flowing into `ref` while `active`: focuses it on mount and whenever `active`/`key` change,
 * and catches keystrokes that land nowhere (e.g. focus fell to <body> after an overlay) — printable keys
 * move focus into the input, ENTER submits its form.
 */
export function useTypingFocus(ref: React.RefObject<HTMLInputElement | null>, active = true, key?: unknown) {
  useEffect(() => {
    if (active) ref.current?.focus();
  }, [ref, active, key]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const input = ref.current;
      if (!input || input.disabled || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el === input || (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))) return;
      if (el?.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return; // let the button activate
      if (e.key === "Enter") {
        e.preventDefault();
        input.focus();
        input.form?.requestSubmit();
      } else if (e.key.length === 1) {
        input.focus(); // the character lands in the newly focused input
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref, active]);
}

/** Calls `onPick(i)` when number key i+1 is pressed (1..count), ignoring typing in fields and modifier combos. */
export function useNumberKeys(count: number, onPick: (i: number) => void, active = true) {
  const cb = useRef(onPick);
  cb.current = onPick;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const n = Number(e.key);
      if (n > count) return;
      e.preventDefault();
      cb.current(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, active]);
}
