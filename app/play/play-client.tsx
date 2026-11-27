"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestView } from "@/lib/guests";
import { fmtDuration } from "@/lib/format";
import { TASK_ORDER, taskDuration } from "@/lib/tasks";
import { Box, Key, TopBar } from "../components/dos";
import { api, useLive, useNow, useTypingFocus } from "../components/hooks";
import { useI18n } from "../components/i18n";

export default function PlayClient() {
  const [guest, setGuest] = useState<GuestView | null | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [majors, setMajors] = useState<Major[]>([]);
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const { guest, majors } = await api<{ guest: GuestView | null; majors?: Major[] }>("/api/guest", { cache: "no-store" });
      if (majors) setMajors(majors);
      setGuest(guest);
      if (guest) setOffset(guest.serverNow - Date.now());
    } catch {
      // keep last state; live socket reconnect will retry
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLive(guest ? `guest:${guest.id}` : null, load);

  if (guest === undefined) return <Shell><p className="blink">{t("common.loading")}</p></Shell>;
  if (!guest) return <Shell><Register majors={majors} onDone={(g) => { setGuest(g); setOffset(g.serverNow - Date.now()); }} /></Shell>;
  return <Shell><Dashboard guest={guest} offset={offset} /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}

type Major = { id: string; name: string };

function Register({ majors, onDone }: { majors: Major[]; onDone: (g: GuestView) => void }) {
  const [name, setName] = useState("");
  const [majorId, setMajorId] = useState("");
  const ready = name.trim().length >= 2 && !!majorId;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const { t, rich } = useI18n();
  useTypingFocus(ref);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const { guest } = await api<{ guest: GuestView }>("/api/guest", { method: "POST", json: { name, majorId } });
      onDone(guest);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box title={t("play.newPlayer")}>
      <p className="text-dos-gray">{rich("play.intro")}</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="font-bold" htmlFor="name">
          {t("play.nameLabel")}
          <span className="blink">_</span>
        </label>
        <input
          id="name"
          ref={ref}
          className="dos-input text-lg"
          enterKeyHint="go"
          value={name}
          readOnly={busy}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          autoComplete="off"
          autoCapitalize="off"
          placeholder={t("play.namePlaceholder")}
          required
        />
        <label className="font-bold" htmlFor="major">
          {t("play.majorLabel")}
        </label>
        <select
          id="major"
          className="dos-input text-lg"
          value={majorId}
          disabled={busy}
          onChange={(e) => setMajorId(e.target.value)}
          required
        >
          <option value="" disabled>
            {t("play.majorPlaceholder")}
          </option>
          {majors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {error && <p className="text-dos-red">! {error}</p>}
        <button className={`dos-btn self-start text-lg${busy ? " is-pending" : ""}`} disabled={busy || !ready}>
          {busy ? <span className="blink">{t("play.starting")}</span> : t("play.start")}
        </button>
      </form>
    </Box>
  );
}

function Dashboard({ guest, offset }: { guest: GuestView; offset: number }) {
  const now = useNow(offset);
  const { t } = useI18n();
  const { current } = guest;
  const solved = TASK_ORDER.filter((t) => guest.finished[t]);
  const total = solved.reduce((s, t) => s + (taskDuration(guest.startedAt, guest.finished, t) ?? 0), 0);

  return (
    <>
      <Box title={t("play.player", { name: guest.name.toUpperCase() })}>
        <p className="text-dos-gray">{t("play.typeCode")}</p>
        <p className="my-2 text-center text-5xl font-bold tracking-[0.3em] text-dos-yellow">{guest.code}</p>
        <p className="text-sm text-dos-gray">{t("play.howTo")}</p>
      </Box>

      {current ? (
        <Box title={t("play.taskTitle", { n: current, name: t(`tasks.${current}`) })}>
          <p className="mb-3 font-bold text-dos-brcyan">⏱ {fmtDuration(now - (guest.currentStartedAt ?? now))}</p>
          <ActivityInfo id={current} guest={guest} />
        </Box>
      ) : (
        <Box title={t("play.allDone")}>
          <p className="text-center text-4xl font-bold text-dos-green">{fmtDuration(total)}</p>
          <p className="mt-2 text-center text-dos-gray">{t("play.checkLeaderboard")}</p>
        </Box>
      )}

      {solved.length > 0 && (
        <Box title={t("play.solved")}>
          <ul className="flex flex-col gap-1">
            {solved.map((task) => (
              <li key={task} className="flex justify-between text-dos-green">
                <span>
                  ✓ [{task}] {t(`tasks.${task}`)}
                </span>
                <span className="tabular-nums">{fmtDuration(taskDuration(guest.startedAt, guest.finished, task) ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Box>
      )}
    </>
  );
}

function ActivityInfo({ id, guest }: { id: 1 | 2 | 3 | 4; guest: GuestView }) {
  const { t, rich } = useI18n();
  switch (id) {
    case 1:
      if (!guest.act1) return null;
      return guest.act1.image ? (
        <div className="flex flex-col gap-2">
          <p className="text-dos-gray">{t("play.act1Info")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={guest.act1.image} alt={t("play.act1ImageAlt")} className="w-full border-2 border-dos-gray bg-black" />
        </div>
      ) : (
        <p className="text-dos-gray">{t("play.act1NoImages")}</p>
      );
    case 2:
      if (!guest.act2) return null;
      return (
        <div className="text-dos-gray">
          <p>{rich("play.act2Info", { min: guest.act2.min, max: guest.act2.max })}</p>
          <p className="mt-2">{rich("play.act2Strategy", { n: guest.act2.maxGuesses })}</p>
          {guest.act2.guesses.length > 0 && (
            <p className="mt-2">
              {t("play.act2Current", {
                guesses: guest.act2.guesses.map((g) => `${g.guess}${g.hint === "higher" ? "↑" : g.hint === "lower" ? "↓" : "✓"}`).join("  "),
              })}
            </p>
          )}
        </div>
      );
    case 3:
      if (!guest.act3) return null;
      const brand = guest.act3.brands[guest.act3.index] ?? guest.act3.brands[0];
      return (
        <div className="text-dos-gray">
          <p>{t("play.act3Info")}</p>
          <p className="my-2 text-lg text-dos-yellow">{brand}</p>
          <p className="text-sm">{t("play.act3NewBrand")}</p>
        </div>
      );
    case 4:
      if (!guest.act4) return null;
      if (!guest.act4.senior) return <p className="text-dos-gray">{t("tasks.noSeniors")}</p>;
      return (
        <div className="text-dos-gray">
          <p className="text-dos-white">{t("tasks.act4Question", { name: guest.act4.senior })}</p>
          <ul className="my-2">
            {guest.act4.options.map((o, i) => (
              <li key={i}>
                <Key k={String(i + 1)} /> {o}
              </li>
            ))}
          </ul>
          <p className="text-sm">{t("play.act4Info")}</p>
        </div>
      );
  }
}
