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
