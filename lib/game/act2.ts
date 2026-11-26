/**
 * Activity 2: adversarial number guess (1–100, 7 guesses).
 *
 * No secret is chosen up front. The game keeps the range [lo, hi] of numbers
 * still consistent with every hint and, on each guess, answers toward the side
 * that needs more guesses to finish (picking at random when both sides need
 * the same number, so halving gets a mix of HIGHER and LOWER). A guess only "wins" when the range has shrunk to that
 * single number — so only disciplined halving (100→50→25→12→6→3→1) is
 * guaranteed to finish within 7 guesses.
 */
export const ACT2_MIN = 1;
export const ACT2_MAX = 100;
export const ACT2_MAX_GUESSES = 7;

export type Hint = "higher" | "lower" | "correct";

export interface Act2State {
  lo: number;
  hi: number;
  guesses: { guess: number; hint: Hint }[];
}

export function freshAct2(): Act2State {
  return { lo: ACT2_MIN, hi: ACT2_MAX, guesses: [] };
}

/** Rebuilds the state from a guess history (out-of-range guesses never moved the range). */
export function act2FromGuesses(guesses: Act2State["guesses"]): Act2State {
  const state = freshAct2();
  for (const { guess, hint } of guesses) {
    if (guess >= state.lo && guess <= state.hi) {
      if (hint === "higher") state.lo = guess + 1;
      else if (hint === "lower") state.hi = guess - 1;
    }
    state.guesses.push({ guess, hint });
  }
  return state;
}

export type Act2Outcome =
  | { kind: "hint"; hint: "higher" | "lower"; state: Act2State }
  | { kind: "correct"; state: Act2State }
  | { kind: "failed"; reveal: number; state: Act2State };

/**
 * Guesses still needed, with best play, to pin down a range of `n` numbers
 * (ceil(log2(n + 1))). An empty side is -1 so it is never chosen.
 */
function cost(n: number): number {
  return n <= 0 ? -1 : Math.ceil(Math.log2(n + 1));
}

export function playAct2(prev: Act2State, guess: number, rand: () => number = Math.random): Act2Outcome {
  const state: Act2State = { ...prev, guesses: [...prev.guesses] };
  let hint: Hint;

  if (guess < state.lo) hint = "higher";
  else if (guess > state.hi) hint = "lower";
  else if (state.lo === state.hi) hint = "correct";
  else {
    const below = cost(guess - state.lo);
    const above = cost(state.hi - guess);
    if (above > below) hint = "higher";
    else if (below > above) hint = "lower";
    else hint = rand() < 0.5 ? "higher" : "lower";
    if (hint === "higher") state.lo = guess + 1;
    else state.hi = guess - 1;
  }

  state.guesses.push({ guess, hint });
  if (hint === "correct") return { kind: "correct", state };
  if (state.guesses.length >= ACT2_MAX_GUESSES) {
    // Any number still in range is consistent with every hint given.
    const reveal = state.lo + Math.floor(rand() * (state.hi - state.lo + 1));
    return { kind: "failed", reveal, state };
  }
  return { kind: "hint", hint, state };
}
