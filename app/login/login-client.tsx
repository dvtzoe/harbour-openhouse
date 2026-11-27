"use client";

import { useRef, useState } from "react";
import { Box, TopBar } from "../components/dos";
import { api, useTypingFocus } from "../components/hooks";
import { useI18n } from "../components/i18n";

export default function LoginClient({ next }: { next: string }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  useTypingFocus(ref);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth", { method: "POST", json: { password: pw } });
      location.href = next; // stays pending while the next page loads
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-md px-4 py-10">
        <Box title={t("login.title")}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label htmlFor="pw">{t("login.password")}</label>
            <input id="pw" type="password" className="dos-input" value={pw} readOnly={busy} onChange={(e) => setPw(e.target.value)} ref={ref} />
            {error && <p className="text-dos-red">! {error}</p>}
            <button className={`dos-btn self-start${busy ? " is-pending" : ""}`} disabled={busy}>
              {busy ? <span className="blink">{t("common.checking")}</span> : t("login.login")}
            </button>
          </form>
        </Box>
      </main>
    </div>
  );
}
