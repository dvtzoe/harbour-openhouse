"use client";

import { useRef, useState } from "react";
import { Box, TopBar } from "../components/dos";
import { api, useTypingFocus } from "../components/hooks";

export default function LoginClient({ next }: { next: string }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useTypingFocus(ref);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw) return;
    try {
      await api("/api/auth", { method: "POST", json: { password: pw } });
      location.href = next;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-md px-4 py-10">
        <Box title="STAFF LOGIN">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label htmlFor="pw">PASSWORD:</label>
            <input id="pw" type="password" className="dos-input" value={pw} onChange={(e) => setPw(e.target.value)} ref={ref} />
            {error && <p className="text-dos-red">! {error}</p>}
            <button className="dos-btn self-start">► LOGIN</button>
          </form>
        </Box>
      </main>
    </div>
  );
}
