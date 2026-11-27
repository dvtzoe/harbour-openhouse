"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StationView } from "@/lib/guests";
import { fmtDuration } from "@/lib/format";
import { TASK_ORDER, nextTask, taskDuration } from "@/lib/tasks";
import { act2FromGuesses, playAct2, type Act2State } from "@/lib/game/act2";
import { Box, KeyCap, TopBar } from "../components/dos";
import { api, isStaffLoginError, useNow, useNumberKeys, useTypingFocus } from "../components/hooks";
import { useI18n } from "../components/i18n";

type ActId = 1 | 2 | 3 | 4;
type Screen = "idle" | `act${ActId}` | "done";
/** Tasks played entirely at the station; after solving the task before one of these, it opens right away. */
const STATION_ONLY: ActId[] = [2, 3];
/** Tasks the station opens straight after the previous solve (task 4 is read on the phone but answered here). */
const CONTINUE_TO: ActId[] = [2, 3, 4];
const AUTO_CONTINUE_MS = 3000;
type Result = {
  result?: "wrong" | "correct" | "done" | "saved" | "already";
  answer?: { name: string; hex: string };
  view: StationView;
};

const INACTIVITY_MS = 60_000;
const AD_SYNC_MS = 5 * 60_000;

/**
 * Ad videos preloaded into memory when the station opens: ad URL → blob URL (null while still downloading).
 * Ads play from the blob so they start instantly; any not yet downloaded stream from the network instead.
 */
const adCache = new Map<string, string | null>();

/** Fetches the ad list and downloads every ad not yet cached; drops ads that were deleted. */
async function syncAds() {
  const { ads } = await api<{ ads: { url: string }[] }>("/api/ads", { cache: "no-store" });
  const urls = new Set(ads.map((a) => a.url));
  for (const [url, blob] of adCache) {
    if (urls.has(url)) continue;
    if (blob) URL.revokeObjectURL(blob);
    adCache.delete(url);
  }
  await Promise.all(
    [...urls]
      .filter((url) => !adCache.has(url))
      .map(async (url) => {
        adCache.set(url, null);
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          const blob = URL.createObjectURL(await res.blob());
          if (adCache.has(url)) adCache.set(url, blob);
          else URL.revokeObjectURL(blob); // deleted while downloading
        } catch {
          adCache.delete(url); // retried on the next sync
        }
      }),
  );
}

/** A random ad to play: its blob URL if preloaded, else its network URL; null when there are no ads. */
function pickAd(): string | null {
  const entries = [...adCache];
  if (!entries.length) return null;
  const [url, blob] = entries[Math.floor(Math.random() * entries.length)];
  return blob ?? url;
}

export default function StationClient({ qrSvg, playUrl }: { qrSvg: string; playUrl: string }) {
  const [screen, setScreen] = useState<Screen>("idle");
  const [view, setView] = useState<StationView | null>(null);
  const [offset, setOffset] = useState(0);
  const [ad, setAd] = useState<{ reason: string } | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "bad" | "good" | "info" } | null>(null);
  const [lastDone, setLastDone] = useState<ActId | null>(null);
  const lastDoneRef = useRef<ActId | null>(null);
  const lastInput = useRef(Date.now());
  const busy = useRef(false);
  const { t } = useI18n();

  const logout = useCallback(() => {
    setScreen("idle");
    setView(null);
    setAd(null);
    setNotice(null);
  }, []);

  // Preload every ad video when the station opens, and pick up newly uploaded/deleted ads periodically.
  useEffect(() => {
    const sync = () => void syncAds().catch(() => undefined);
    sync();
    const id = setInterval(sync, AD_SYNC_MS);
    return () => clearInterval(id);
  }, []);

  // Inactivity auto-logout (paused while an ad plays).
  useEffect(() => {
    const bump = () => (lastInput.current = Date.now());
    window.addEventListener("keydown", bump, true);
    window.addEventListener("pointerdown", bump, true);
    const id = setInterval(() => {
      if (screen !== "idle" && !ad && Date.now() - lastInput.current > INACTIVITY_MS) logout();
    }, 1000);
    return () => {
      window.removeEventListener("keydown", bump, true);
      window.removeEventListener("pointerdown", bump, true);
      clearInterval(id);
    };
  }, [screen, ad, logout]);

  const accept = useCallback((v: StationView) => {
    setView(v);
    setOffset(v.serverNow - Date.now());
  }, []);

  /** Calls the station API; returns null (and shows the error) on failure. */
  const call = useCallback(
    async (body: Record<string, unknown>): Promise<Result | null> => {
      if (busy.current) return null;
      busy.current = true;
      try {
        const r = await api<Result>("/api/station", { method: "POST", json: body });
        accept(r.view);
        return r;
      } catch (e) {
        if (isStaffLoginError(e)) location.href = "/login?next=/station";
        setNotice({ text: (e as Error).message, tone: "bad" });
        return null;
      } finally {
        busy.current = false;
      }
    },
    [accept],
  );

  /** Act 2 saves run one at a time, in order, so an older save never lands after a newer one. */
  const act2Saves = useRef<Promise<unknown>>(Promise.resolve());

  /** Queues a background act 2 save. On failure, shows the error and reloads the guest from the server. */
  const saveAct2 = useCallback(
    (code: string, guesses: Act2State["guesses"], outcome: "hint" | "failed") => {
      act2Saves.current = act2Saves.current.then(() =>
        api<Result>("/api/station", { method: "POST", json: { action: "act2", code, guesses, outcome } }).catch(async (e) => {
          setNotice({ text: t("station.saveFailed", { error: (e as Error).message }), tone: "bad" });
          const r = await api<Result>("/api/station", { method: "POST", json: { action: "lookup", code } }).catch(() => null);
          if (r) accept(r.view);
        }),
      );
    },
    [accept, t],
  );

  /** Shows a new act 2 guess history right away, before the server has it. */
  const showAct2 = useCallback((guesses: Act2State["guesses"]) => {
    setView((v) => (v?.act2 ? { ...v, act2: { ...v.act2, guesses } } : v));
  }, []);

  const penalty = useCallback((reason: string, delayMs: number) => {
    setTimeout(() => {
      setNotice(null);
      setAd({ reason });
    }, delayMs);
  }, []);

  const onResult = useCallback(
    (act: ActId, r: Result | null, wrongText: string, wrongDelay = 1500) => {
      if (!r) return;
      if (r.result === "done" || r.result === "already") {
        setNotice(null);
        setLastDone(act);
        lastDoneRef.current = act;
        setScreen("done");
      } else if (r.result === "wrong") {
        setNotice({ text: wrongText, tone: "bad" });
        penalty(wrongText, wrongDelay);
      }
    },
    [penalty],
  );

  /** Opens the guest's current task, or the all-done screen. */
  const openCurrent = useCallback((v: StationView) => {
    setNotice(null);
    if (v.current) setScreen(`act${v.current}`);
    else {
      setLastDone(4);
      lastDoneRef.current = 4;
      setScreen("done");
    }
  }, []);

  /** After a solve: open the next task if it is answered at the station, otherwise log out. */
  const continueAfterDone = useCallback(() => {
    const done = lastDoneRef.current;
    const next = done ? nextTask(done) : null;
    if (view && next && CONTINUE_TO.includes(next) && view.current === next) openCurrent(view);
    else logout();
  }, [view, openCurrent, logout]);

  // Global keys: ESC logs out from a task; ENTER/ESC leaves the done screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ad) return;
      if (screen === "done") {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault(); // don't let the key also submit in the next task
          continueAfterDone();
        }
      } else if (screen.startsWith("act") && e.key === "Escape") {
        logout();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        right={
          view && screen !== "idle" ? (
            <span className="flex gap-4">
              <span>{t("station.player", { name: view.name.toUpperCase() })}</span>
              {/* Mouse/touch only (tabIndex -1 keeps it out of arrow-key nav, so a stray arrow + ENTER can't log out); keyboard uses ESC. */}
              <button type="button" tabIndex={-1} className="underline" onClick={logout}>
                {t("station.logout")}
              </button>
            </span>
          ) : (
            t("station.station")
          )
        }
      />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        {screen === "idle" && (
          <Idle
            qrSvg={qrSvg}
            playUrl={playUrl}
            onCode={async (code) => {
              const r = await call({ action: "lookup", code });
              if (r) openCurrent(r.view);
            }}
            error={notice?.tone === "bad" ? notice.text : ""}
          />
        )}

        {view && screen.startsWith("act") && <TaskClock view={view} offset={offset} />}

        {view?.act1 && screen === "act1" && (
          <Act1 act1={view.act1} adActive={!!ad} onSubmit={async (answer) => onResult(1, await call({ action: "act1", code: view.code, answer }), t("station.wrongAnswer"))} />
        )}
        {view?.act2 && screen === "act2" && (
          <Act2
            act2={view.act2}
            adActive={!!ad}
            onGuess={async (guess) => {
              // The game has no secret number, so the station plays it locally and answers instantly.
              if (view.act2!.guesses.length >= view.act2!.maxGuesses) return; // spent attempt, waiting for the ad
              const outcome = playAct2(act2FromGuesses(view.act2!.guesses), guess);
              if (outcome.kind === "hint") {
                showAct2(outcome.state.guesses);
                saveAct2(view.code, outcome.state.guesses, "hint");
              } else if (outcome.kind === "failed") {
                const text = t("station.outOfGuesses", { n: outcome.reveal });
                showAct2(outcome.state.guesses);
                saveAct2(view.code, outcome.state.guesses, "failed");
                setNotice({ text, tone: "bad" });
                setTimeout(() => showAct2([]), 3500); // fresh attempt after the ad
                penalty(text, 3500);
              } else {
                // A win needs the server's finish time for the done screen, so wait for it.
                const before = view.act2!.guesses;
                showAct2(outcome.state.guesses);
                await act2Saves.current;
                const r = await call({ action: "act2", code: view.code, guesses: outcome.state.guesses, outcome: "correct" });
                if (!r) showAct2(before); // not saved: undo the win so the guess can be retried
                onResult(2, r, "");
              }
            }}
          />
        )}
        {view?.current === 3 && screen === "act3" && (
          <Act3
            view={view}
            locked={!!notice || !!ad}
            onPick={async (choice) => {
              const r = await call({ action: "act3", code: view.code, choice });
              if (r?.result === "wrong" && r.answer) {
                onResult(3, r, t("station.wrongColor", { brand: r.answer.name, hex: r.answer.hex }), 3000);
              } else onResult(3, r, "");
            }}
          />
        )}
        {view?.act4 && screen === "act4" && (
          <Act4
            act4={view.act4}
            locked={!!notice || !!ad}
            onPick={async (choice) => onResult(4, await call({ action: "act4", code: view.code, choice }), t("station.wrongAnswer"))}
          />
        )}
        {view && screen === "done" && lastDone && <Done view={view} act={lastDone} onContinue={continueAfterDone} />}

        {notice && screen !== "idle" && (
          <p
            className={`px-3 py-1 text-xl font-bold ${
              notice.tone === "bad" ? "bg-dos-red text-dos-black" : notice.tone === "good" ? "bg-dos-green text-dos-black" : "bg-dos-gray text-dos-black"
            }`}
          >
            {notice.text}
          </p>
        )}
      </main>
      {screen !== "idle" && (
        <footer className="dos-bar flex gap-6 px-3 py-1 text-sm font-bold">
          {screen === "done" ? <span>{t("station.footerContinue")}</span> : <span>{t("station.footerLogout")}</span>}
          {screen === "act3" && <span>{t("station.footerAct3")}</span>}
          {screen === "act4" && <span>{t("station.footerAct4")}</span>}
          <span>{t("station.footerIdle", { s: INACTIVITY_MS / 1000 })}</span>
        </footer>
      )}
      {ad && (
        <AdBreak
          reason={ad.reason}
          onEnd={() => {
            setAd(null);
            lastInput.current = Date.now();
          }}
        />
      )}
    </div>
  );
}

function Idle({ qrSvg, playUrl, onCode, error }: { qrSvg: string; playUrl: string; onCode: (c: string) => Promise<void>; error: string }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  useTypingFocus(ref);

  return (
    <div className="grid w-full max-w-5xl gap-8 md:grid-cols-2">
      <Box title={t("station.scanTitle")}>
        <div className="mx-auto w-full max-w-sm bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="mt-3 text-center text-dos-gray">{playUrl}</p>
        <p className="mt-2 text-center">{t("station.scanHint")}</p>
      </Box>
      <Box title={t("station.playingTitle")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length !== 4 || loading) return;
            setLoading(true);
            onCode(code).finally(() => setLoading(false));
          }}
        >
          <label htmlFor="code" className="text-xl">
            {t("station.codeLabel")}
            <span className="blink">_</span>
          </label>
          <input
            id="code"
            ref={ref}
            className="dos-input text-center text-6xl font-bold uppercase tracking-[0.4em]"
            value={code}
            readOnly={loading}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
            autoComplete="off"
            spellCheck={false}
          />
          {error && <p className="text-dos-red">! {error}</p>}
          <button className={`dos-btn self-start text-xl${loading ? " is-pending" : ""}`} disabled={code.length !== 4 || loading}>
            {loading ? <span className="blink">{t("station.loading")}</span> : t("station.enter")}
          </button>
        </form>
      </Box>
    </div>
  );
}

/** "TASK n/4" plus the current task's own running timer. */
function TaskClock({ view, offset }: { view: StationView; offset: number }) {
  const now = useNow(offset);
  const { t } = useI18n();
  if (!view.current || view.currentStartedAt == null) return null;
  return (
    <p className="text-2xl font-bold">
      {t("station.taskClock", { n: view.current })} <span className="text-dos-brcyan">⏱ {fmtDuration(now - view.currentStartedAt)}</span>
    </p>
  );
}

function Act1({ act1, adActive, onSubmit }: { act1: NonNullable<StationView["act1"]>; adActive: boolean; onSubmit: (a: string) => Promise<void> }) {
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  useTypingFocus(ref, !adActive);
  // Spaces and dots are allowed while typing ("A.B." / "A B"); the server ignores them when checking.
  const hasLetters = /[A-Z]/.test(answer);

  if (!act1.image) return <Box title={t("tasks.1")}>{t("station.act1NoImages")}</Box>;
  return (
    <Box title={t("tasks.1")} className="w-full max-w-3xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={act1.image} alt={t("station.act1ImageAlt")} className="mx-auto max-h-[50vh] border-2 border-dos-gray bg-black" />
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!hasLetters || checking) return;
          setChecking(true);
          onSubmit(answer).finally(() => setChecking(false));
        }}
      >
        <label htmlFor="a1" className="text-xl">
          {t("station.act1Answer")}
        </label>
        <input
          id="a1"
          ref={ref}
          className="dos-input flex-1 text-2xl uppercase tracking-widest"
          value={answer}
          readOnly={checking}
          onChange={(e) => setAnswer(e.target.value.toUpperCase().replace(/[^A-Z. ]/g, ""))}
          autoComplete="off"
          spellCheck={false}
        />
        <button className={`dos-btn text-xl${checking ? " is-pending" : ""}`} disabled={!hasLetters || checking}>
          {checking ? <span className="blink">{t("common.checking")}</span> : t("station.act1Submit")}
        </button>
      </form>
    </Box>
  );
}

function Act2({ act2, adActive, onGuess }: { act2: NonNullable<StationView["act2"]>; adActive: boolean; onGuess: (g: number) => Promise<void> }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const { guesses, maxGuesses, min, max } = act2;
  const saving = guesses.at(-1)?.hint === "correct"; // shown instantly; waiting on the server's finish time
  const { t } = useI18n();
  useTypingFocus(ref, !adActive && !saving, guesses.length);

  return (
    <Box title={t("tasks.2")} className="w-full max-w-2xl">
      <p className="text-dos-gray">{t("station.act2Intro", { min, max, n: maxGuesses })}</p>
      <ol className="my-4 grid gap-1 text-2xl">
        {Array.from({ length: maxGuesses }, (_, i) => {
          const g = guesses[i];
          return (
            <li key={i} className={g ? "" : "text-dos-dark"}>
              #{i + 1}{" "}
              {g ? (
                <>
                  <span className="text-dos-yellow">{String(g.guess).padStart(3, " ")}</span>{" "}
                  {t(g.hint === "higher" ? "station.act2Higher" : g.hint === "lower" ? "station.act2Lower" : "station.act2Correct")}
                  {saving && i === guesses.length - 1 && <span className="blink text-dos-gray"> {t("station.act2Saving")}</span>}
                </>
              ) : (
                "---"
              )}
            </li>
          );
        })}
      </ol>
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(value);
          if (!Number.isInteger(n) || n < min || n > max) return;
          setValue("");
          await onGuess(n);
        }}
      >
        <label htmlFor="g2" className="text-xl">
          {t("station.act2GuessLabel", { n: guesses.length + 1 })}
        </label>
        <input
          id="g2"
          ref={ref}
          inputMode="numeric"
          className="dos-input w-32 text-center text-3xl"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))}
          autoComplete="off"
          disabled={adActive || saving}
        />
        <button className="dos-btn text-xl" disabled={!value || adActive || saving}>
          {t("station.act2Guess")}
        </button>
        <span className="text-dos-gray">{t("station.act2Left", { n: maxGuesses - guesses.length })}</span>
      </form>
    </Box>
  );
}

/** Marks option `i` as picked the instant it is chosen (click or key), until the server's answer comes back. */
function usePick(onPick: (i: number) => Promise<void>) {
  const [picked, setPicked] = useState<number | null>(null);
  const busy = useRef(false);
  const pick = useCallback(
    (i: number) => {
      if (busy.current) return;
      busy.current = true;
      setPicked(i);
      onPick(i).finally(() => {
        busy.current = false;
        setPicked(null);
      });
    },
    [onPick],
  );
  return [picked, pick] as const;
}

function Act3({ view, locked, onPick }: { view: StationView; locked: boolean; onPick: (i: number) => Promise<void> }) {
  const round = view.act3Round;
  const [picked, pick] = usePick(onPick);
  const { t } = useI18n();
  useNumberKeys(round?.options.length ?? 0, pick, !locked && !!round && picked === null);

  if (!round) return <Box title={t("tasks.3")}>{t("station.act3NoBrands")}</Box>;
  return (
    <Box
      title={round.total > 1 ? t("station.act3RoundTitle", { name: t("tasks.3"), i: round.index + 1, total: round.total }) : t("tasks.3")}
      className="w-full max-w-4xl"
    >
      <p className="text-center text-dos-gray">{t("station.act3Question")}</p>
      <p className="mb-6 text-center text-5xl font-bold text-dos-yellow">{round.name}</p>
      <p className="mb-4 text-center text-dos-gray">{t("station.act3Keys", { n: round.options.length })}</p>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {round.options.map((hex, i) => (
          <button
            key={`${round.index}-${hex}`}
            disabled={locked || picked !== null}
            onClick={() => pick(i)}
            className={`dos-btn flex flex-col items-center gap-2 p-3${picked === i ? " is-pending" : ""}`}
          >
            <span className="true-color block aspect-square w-full border-4 border-dos-black" style={{ background: hex }} />
            <span className="text-xl">
              <KeyCap k={String(i + 1)} /> {picked === i ? <span className="blink">{t("common.checking")}</span> : t("station.act3Pick")}
            </span>
          </button>
        ))}
      </div>
    </Box>
  );
}

function Act4({ act4, locked, onPick }: { act4: NonNullable<StationView["act4"]>; locked: boolean; onPick: (i: number) => Promise<void> }) {
  const { senior, options } = act4;
  const [picked, pick] = usePick(onPick);
  const { t } = useI18n();
  useNumberKeys(options.length, pick, !locked && picked === null);

  if (!senior)
    return (
      <Box title={t("tasks.4")} className="w-full max-w-3xl">
        <p className="text-2xl text-dos-yellow">{t("tasks.noSeniors")}</p>
      </Box>
    );

  return (
    <Box title={t("tasks.4")} className="w-full max-w-3xl">
      <p className="mb-2 text-2xl">{t("tasks.act4Question", { name: senior })}</p>
      <p className="mb-4 text-dos-gray">{t("station.act4Keys", { n: options.length })}</p>
      <ul className="flex flex-col gap-4 text-xl">
        {options.map((o, i) => (
          <li key={i}>
            <button
              disabled={locked || picked !== null}
              onClick={() => pick(i)}
              className={`dos-btn flex w-full items-center gap-3 px-3 py-2 text-left${picked === i ? " is-pending" : ""}`}
            >
              <KeyCap k={String(i + 1)} /> {o}
              {picked === i && <span className="blink ml-auto">◄ {t("common.checking")}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Box>
  );
}

function Done({ view, act, onContinue }: { view: StationView; act: ActId; onContinue: () => void }) {
  const time = taskDuration(view.startedAt, view.finished, act);
  const all = view.current === null;
  const total = all ? TASK_ORDER.reduce((s, t) => s + (taskDuration(view.startedAt, view.finished, t) ?? 0), 0) : 0;
  const next = view.current;
  const atStation = next !== null && STATION_ONLY.includes(next);
  const canContinue = next !== null && CONTINUE_TO.includes(next);
  const { t } = useI18n();

  // Station-only next task: carry straight on after a short pause.
  useEffect(() => {
    if (!atStation) return;
    const id = setTimeout(onContinue, AUTO_CONTINUE_MS);
    return () => clearTimeout(id);
  }, [atStation, onContinue]);

  if (all && view.victory) return <Victory rank={view.victory.rank} tag={view.victory.tag} onContinue={onContinue} />;

  return (
    <Box title={t("station.doneTitle")} className="w-full max-w-xl text-center">
      <p className="text-2xl">{t("station.doneSolved", { n: act, name: t(`tasks.${act}`) })}</p>
      {time != null && <p className="my-3 text-5xl font-bold text-dos-green">{fmtDuration(time)}</p>}
      {all ? (
        <p className="my-3 text-2xl text-dos-yellow">
          {t("station.doneAll", { time: fmtDuration(total) })}
          <br />
          {t("station.doneCheckLeaderboard")}
        </p>
      ) : atStation ? (
        <p className="my-3 text-xl text-dos-yellow">{t("station.doneNextStation", { n: next!, name: t(`tasks.${next!}`) })}</p>
      ) : (
        <p className="my-3 text-xl text-dos-yellow">{t("station.doneNextPhone", { n: next ?? "" })}</p>
      )}
      <button className="dos-btn mt-2 text-xl" onClick={onContinue} autoFocus>
        {t(atStation ? "station.doneNextTask" : canContinue ? "station.doneContinue" : "station.doneLogout")}
      </button>
    </Box>
  );
}

/** Live webcam stream for the victory screen; null until granted, "off" if unavailable or denied. */
function useWebcam() {
  const [stream, setStream] = useState<MediaStream | null | "off">(null);
  useEffect(() => {
    let live: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStream("off");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        live = s;
        setStream(s);
      })
      .catch(() => !cancelled && setStream("off"));
    // Turn the camera off as soon as the screen closes.
    return () => {
      cancelled = true;
      live?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return stream;
}

/**
 * All-4-done screen: the station's webcam framed as a DOS window, so the guest sees themselves "inside"
 * the game and snaps it on their own phone. Nothing is captured or stored here.
 */
function Victory({ rank, tag, onContinue }: { rank: number | null; tag: string; onContinue: () => void }) {
  const stream = useWebcam();
  const video = useRef<HTMLVideoElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (video.current && stream && stream !== "off") video.current.srcObject = stream;
  }, [stream]);

  return (
    // .true-color lifts the frame above the CRT scanlines so phone photos of it come out clean.
    <section className="dos-box true-color flex w-full max-w-5xl flex-col px-4 pb-4 pt-1">
      <h2 className="dos-title self-center text-xl sm:text-2xl">{t("station.victoryTitle")}</h2>
      <div className="relative mt-2 aspect-video w-full overflow-hidden border-4 border-dos-black bg-dos-black">
        {stream && stream !== "off" ? (
          // Mirrored, like a selfie camera, so moving left moves left on screen.
          <video ref={video} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-dos-gray">
            {stream === "off" ? t("station.victoryPose") : <span className="blink">{t("station.victoryCamera")}</span>}
          </div>
        )}
        {rank != null && (
          <div className="dos-box absolute left-4 top-4 px-4 py-1 text-6xl font-bold text-dos-yellow sm:text-7xl">#{rank}</div>
        )}
        {tag && <div className="dos-bar absolute inset-x-0 bottom-0 px-3 py-2 text-center text-2xl font-bold sm:text-3xl">{tag}</div>}
      </div>
      <p className="mt-3 text-center text-2xl font-bold text-dos-green">{t("station.victorySnap")}</p>
      <button className="dos-btn mt-3 self-center text-xl" onClick={onContinue} autoFocus>
        {t("station.doneLogout")}
      </button>
    </section>
  );
}

/**
 * Unskippable university ad. Goes black (with the reason bar) at once and stays black until the video
 * actually plays. Falls back to a countdown if no ad is available or it fails to play.
 */
function AdBreak({ reason, onEnd }: { reason: string; onEnd: () => void }) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const ended = useRef(false);
  const { t } = useI18n();
  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    onEnd();
  }, [onEnd]);

  useEffect(() => {
    const ad = pickAd();
    if (ad) return setSrc(ad);
    // Nothing cached yet (e.g. the list fetch failed on open): try once more before falling back.
    syncAds()
      .then(() => setSrc(pickAd()))
      .catch(() => setSrc(null));
  }, []);

  // Fallback countdown when there is no playable video.
  useEffect(() => {
    if (src !== null) return;
    let n = 10;
    setLeft(n);
    const id = setInterval(() => {
      n -= 1;
      setLeft(n);
      if (n <= 0) {
        clearInterval(id);
        finish();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [src, finish]);

  // Block keyboard shortcuts during the ad.
  useEffect(() => {
    const stop = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("keydown", stop, true);
    return () => window.removeEventListener("keydown", stop, true);
  }, []);

  // Above the .crt scanline overlay (z 100) and .true-color swatches (z 101): ads render unfiltered.
  return (
    <div className="fixed inset-0 z-[102] flex flex-col bg-black">
      <div className="dos-bar flex justify-between px-3 py-1 font-bold">
        <span>{reason}</span>
        {(playing || src === null) && <span>{left !== null ? t("station.adRetryIn", { s: Math.max(0, Math.ceil(left)) }) : t("station.adLabel")}</span>}
      </div>
      <div className="flex flex-1 items-center justify-center">
        {src ? (
          <video
            src={src}
            className={`h-full max-h-[calc(100dvh-2rem)] w-full object-contain${playing ? "" : " invisible"}`}
            autoPlay
            playsInline
            preload="auto"
            disablePictureInPicture
            controls={false}
            onContextMenu={(e) => e.preventDefault()}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.play().catch(() => {
                // Autoplay with sound blocked: retry muted.
                v.muted = true;
                v.play().catch(() => setSrc(null));
              });
            }}
            onPlaying={() => setPlaying(true)}
            onTimeUpdate={(e) => setLeft(e.currentTarget.duration - e.currentTarget.currentTime)}
            onPause={(e) => !e.currentTarget.ended && e.currentTarget.play().catch(() => undefined)}
            onEnded={finish}
            onError={() => setSrc(null)}
          />
        ) : (
          src === null && (
            <div className="dos-box p-8 text-center text-3xl">
              <p className="text-dos-yellow">{t("station.adStandBy")}</p>
              <p className="mt-2">{t("station.adLearnMore")}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
