import { isStaff, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { act2FromGuesses, freshAct2, ACT2_MIN, ACT2_MAX, ACT2_MAX_GUESSES, type Act2State } from "@/lib/game/act2";
import type { Act3State } from "@/lib/game/act3";
import {
  act1ItemFor,
  act4Question,
  finishedMapByCode,
  guestByCode,
  markFinished,
  newAct3State,
  repickAct4Senior,
  stationView,
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
  /** The station plays the game itself and reports the guess history and how it ended. */
  | { action: "act2"; code: string; guesses: Act2State["guesses"]; outcome: "hint" | "correct" | "failed" }
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
      // Stations are staff-only, so their result is trusted; only the shape is checked.
      const { guesses, outcome } = body;
      const valid =
        Array.isArray(guesses) &&
        guesses.length <= ACT2_MAX_GUESSES &&
        guesses.every(
          (x) => Number.isInteger(x?.guess) && x.guess >= ACT2_MIN && x.guess <= ACT2_MAX && ["higher", "lower", "correct"].includes(x.hint),
        ) &&
        ["hint", "correct", "failed"].includes(outcome);
      if (!valid) return bad("Bad guess data");
      if (outcome === "correct") {
        await finish(g, 2);
        return respond({ result: "done" });
      }
      const nextState: Act2State = outcome === "failed" ? freshAct2() : act2FromGuesses(guesses);
      await d.prepare("UPDATE guests SET act2_state = ? WHERE id = ?").bind(JSON.stringify(nextState), g.id).run();
      broadcastLater(`guest:${g.id}`);
      // Only act2_state changed, so build the view from memory instead of re-reading.
      return Response.json({ result: "saved", view: await stationView({ ...g, act2_state: JSON.stringify(nextState) }, finished) });
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
      const q = await act4Question(g);
      if (!q.question) return bad("No seniors configured for activity 4");
      if (Number(body.choice) !== q.correct) {
        // Wrong: ask about a different senior next time.
        await repickAct4Senior(g);
        broadcastLater(`guest:${g.id}`);
        return respond({ result: "wrong" });
      }
      await finish(g, 4);
      return respond({ result: "done" });
    }
  }
  return bad("Unknown action");
}
