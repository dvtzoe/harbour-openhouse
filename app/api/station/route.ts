import { isStaff, unauthorized } from "@/lib/auth";
import { db, getSetting } from "@/lib/db";
import { playAct2, freshAct2, ACT2_MIN, ACT2_MAX, type Act2State } from "@/lib/game/act2";
import type { Act3State } from "@/lib/game/act3";
import {
  DEFAULT_ACT4,
  act1ItemFor,
  finishedMapByCode,
  guestByCode,
  markFinished,
  newAct3State,
  stationView,
  type Act4Config,
  type ActivityId,
  type GuestRow,
} from "@/lib/guests";
import { bad, jsonBody } from "@/lib/http";
import { currentTask } from "@/lib/tasks";
import { broadcast, broadcastLater } from "@/lib/live";

export const dynamic = "force-dynamic";

type Body =
  | { action: "lookup"; code: string }
  | { action: "act1"; code: string; answer: string }
  | { action: "act2"; code: string; guess: number }
  | { action: "act3"; code: string; choice: number }
  | { action: "act4"; code: string; choice: number };

const lettersOnly = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

async function reload(g: GuestRow) {
  return (await db()).prepare("SELECT * FROM guests WHERE id = ?").bind(g.id).first<GuestRow>() as Promise<GuestRow>;
}

async function finish(g: GuestRow, activity: ActivityId) {
  await markFinished(g.id, activity);
  broadcastLater(`guest:${g.id}`, "leaderboard");
}

export async function POST(req: Request) {
  if (!(await isStaff())) return unauthorized();
  const body = await jsonBody<Body>(req);
  if (!body?.code) return bad("Missing code");

  // Independent reads: run them in one round of waiting.
  const [g, finished] = await Promise.all([guestByCode(body.code), finishedMapByCode(body.code)]);
  if (!g) return bad("UNKNOWN CODE", 404);
  const d = await db();

  const respond = async (extra: Record<string, unknown> = {}) =>
    Response.json({ ...extra, view: await stationView(await reload(g)) });

  if (body.action === "lookup") return respond();

  const act = Number(body.action.slice(3)) as ActivityId;
  if (finished[act]) return respond({ result: "already" });
  // Tasks are solved in order: only the current one accepts answers.
  const current = currentTask(finished);
  if (act !== current) return bad(`LOCKED — solve task ${current} first`, 409);

  switch (body.action) {
    case "act1": {
      const item = await act1ItemFor(g);
      if (!item) return bad("No images configured for activity 1");
      if (lettersOnly(body.answer ?? "") !== lettersOnly(item.answer)) return respond({ result: "wrong" });
      await finish(g, 1);
      return respond({ result: "done" });
    }

    case "act2": {
      const guess = Math.trunc(Number(body.guess));
      if (!Number.isFinite(guess) || guess < ACT2_MIN || guess > ACT2_MAX) return bad(`Guess ${ACT2_MIN}–${ACT2_MAX}`);
      const outcome = playAct2(JSON.parse(g.act2_state) as Act2State, guess);
      const nextState = outcome.kind === "failed" ? freshAct2() : outcome.state;
      await d.prepare("UPDATE guests SET act2_state = ? WHERE id = ?").bind(JSON.stringify(nextState), g.id).run();
      if (outcome.kind === "correct") {
        await finish(g, 2);
        return respond({ result: "done", guess });
      }
      // Not finished, so nothing but act2_state changed: build the view from memory
      // instead of re-reading, and let the phone's live update go out in the background.
      broadcastLater(`guest:${g.id}`);
      const view = await stationView({ ...g, act2_state: JSON.stringify(nextState) }, finished);
      if (outcome.kind === "failed") {
        return Response.json({ result: "wrong", reveal: outcome.reveal, history: outcome.state.guesses, view });
      }
      return Response.json({ result: "hint", hint: outcome.hint, guess, view });
    }

    case "act3": {
      const state = JSON.parse(g.act3_state) as Act3State;
      const round = state.rounds[state.index];
      if (!round) return bad("Not enough brands configured");
      if (Number(body.choice) !== round.correct) {
        // Wrong: reveal the real colour, then a fresh set of brands for the retry.
        const answer = { name: round.name, hex: round.options[round.correct] };
        await d.prepare("UPDATE guests SET act3_state = ? WHERE id = ?").bind(JSON.stringify(await newAct3State()), g.id).run();
        await broadcast(`guest:${g.id}`);
        return respond({ result: "wrong", answer });
      }
      // One correct pick clears the task (also for guests still holding an older multi-brand state).
      await finish(g, 3);
      return respond({ result: "done" });
    }

    case "act4": {
      const cfg = await getSetting<Act4Config>("act4", DEFAULT_ACT4);
      if (Number(body.choice) !== cfg.correct) return respond({ result: "wrong" });
      await finish(g, 4);
      return respond({ result: "done" });
    }
  }
  return bad("Unknown action");
}
