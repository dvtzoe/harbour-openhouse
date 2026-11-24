"use client";

import { useCallback, useEffect, useState } from "react";
import type { GuestView } from "@/lib/guests";
import { fmtDuration } from "@/lib/format";
import { Box, Key, TopBar } from "../components/dos";
import { api, useLive, useNow } from "../components/hooks";

const NAMES = { 1: "DECODE.EXE", 2: "BINSRCH.EXE", 3: "COLORS.EXE", 4: "ASKAROUND.EXE" } as const;

export default function PlayClient() {
  const [guest, setGuest] = useState<GuestView | null | undefined>(undefined);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      const { guest } = await api<{ guest: GuestView | null }>("/api/guest", { cache: "no-store" });
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

  if (guest === undefined) return <Shell><p className="blink">LOADING...</p></Shell>;
  if (!guest) return <Shell><Register onDone={(g) => { setGuest(g); setOffset(g.serverNow - Date.now()); }} /></Shell>;
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

function Register({ onDone }: { onDone: (g: GuestView) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { guest } = await api<{ guest: GuestView }>("/api/guest", { method: "POST", json: { name } });
      onDone(guest);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box title="NEW PLAYER">
      <p className="text-dos-gray">
        Four challenges are hidden around this room. Pick a name to start.{" "}
        <span className="text-dos-yellow">All four timers start the moment you press START.</span>
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="font-bold" htmlFor="name">
          C:\&gt; ENTER YOUR NAME<span className="blink">_</span>
        </label>
        <input
          id="name"
          className="dos-input text-lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          autoComplete="off"
          autoCapitalize="off"
          placeholder="2–16 characters"
          required
        />
        {error && <p className="text-dos-red">! {error}</p>}
        <button className="dos-btn self-start text-lg" disabled={busy || name.trim().length < 2}>
          {busy ? "STARTING..." : "► START"}
        </button>
      </form>
    </Box>
  );
}

function Dashboard({ guest, offset }: { guest: GuestView; offset: number }) {
  const now = useNow(offset);
  const done = Object.keys(guest.finished).length;

  return (
    <>
      <Box title={`PLAYER: ${guest.name.toUpperCase()}`}>
        <p className="text-dos-gray">At the station PC, type your code:</p>
        <p className="my-2 text-center text-5xl font-bold tracking-[0.3em] text-dos-yellow">{guest.code}</p>
        <p className="text-sm text-dos-gray">
          Explore the tasks here on your phone, then answer at the station. {done}/4 complete.
        </p>
      </Box>

      {([1, 2, 3, 4] as const).map((id) => {
        const fin = guest.finished[id];
        const time = fmtDuration((fin ?? now) - guest.startedAt);
        return (
          <Box
            key={id}
            title={
              <>
                [{id}] {NAMES[id]}
              </>
            }
          >
            <p className={`mb-3 font-bold ${fin ? "text-dos-green" : "text-dos-brcyan"}`}>
              {fin ? `✓ COMPLETE  ${time}` : `⏱ ${time}`}
            </p>
            {!fin && <ActivityInfo id={id} guest={guest} />}
          </Box>
        );
      })}
    </>
  );
}

function ActivityInfo({ id, guest }: { id: 1 | 2 | 3 | 4; guest: GuestView }) {
  switch (id) {
    case 1:
      return guest.act1.image ? (
        <div className="flex flex-col gap-2">
          <p className="text-dos-gray">
            Image {guest.act1.progress + 1} of {guest.act1.total}. Decode it — the clue is somewhere in real life.
            Answer with letters only at the station.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={guest.act1.image} alt={`Puzzle image ${guest.act1.progress + 1}`} className="w-full border-2 border-dos-gray bg-black" />
        </div>
      ) : (
        <p className="text-dos-gray">No images yet — ask a staff member.</p>
      );
    case 2:
      return (
        <div className="text-dos-gray">
          <p>
            Guess a number from {guest.act2.min} to {guest.act2.max} at the station. After each guess you hear{" "}
            <span className="text-dos-yellow">HIGHER</span> or <span className="text-dos-yellow">LOWER</span>.
          </p>
          <p className="mt-2">
            You have <span className="text-dos-yellow">{guest.act2.maxGuesses} guesses</span>. Luck won&apos;t save you — plan a
            strategy that <em>always</em> finds the number in {guest.act2.maxGuesses}.
          </p>
          {guest.act2.guesses.length > 0 && (
            <p className="mt-2">
              Current attempt: {guest.act2.guesses.map((g) => `${g.guess}${g.hint === "higher" ? "↑" : g.hint === "lower" ? "↓" : "✓"}`).join("  ")}
            </p>
          )}
        </div>
      );
    case 3:
      return (
        <div className="text-dos-gray">
          <p>At the station, pick the exact official colour of each brand from 4 very similar shades:</p>
          <ol className="my-2 list-inside list-decimal text-lg text-dos-yellow">
            {guest.act3.brands.map((b, i) => (
              <li key={b} className={i < guest.act3.index ? "text-dos-green line-through" : ""}>
                {b}
              </li>
            ))}
          </ol>
          <p className="text-sm">A wrong pick gives you three new brands.</p>
        </div>
      );
    case 4:
      return (
        <div className="text-dos-gray">
          <p className="text-dos-white">{guest.act4.question}</p>
          <ul className="my-2">
            {guest.act4.options.map((o, i) => (
              <li key={i}>
                <Key k={String(i + 1)} /> {o}
              </li>
            ))}
          </ul>
          <p className="text-sm">Ask our students around campus, then answer at the station.</p>
        </div>
      );
  }
}
