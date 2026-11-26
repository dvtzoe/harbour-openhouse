import { describe, expect, test } from "bun:test";
import { playAct2, freshAct2, type Act2State } from "../lib/game/act2";
import { makeDecoys, deltaE } from "../lib/game/color";
import { freshAct3 } from "../lib/game/act3";

function bisect(): { won: boolean; guesses: number } {
  let s: Act2State = freshAct2();
  for (let i = 0; i < 10; i++) {
    const g = Math.floor((s.lo + s.hi) / 2);
    const o = playAct2(s, g);
    if (o.kind === "correct") return { won: true, guesses: o.state.guesses.length };
    if (o.kind === "failed") return { won: false, guesses: o.state.guesses.length };
    s = o.state;
  }
  return { won: false, guesses: 99 };
}

describe("act2 adversary", () => {
  test("perfect bisection always wins within 7", () => {
    for (let i = 0; i < 2000; i++) {
      const r = bisect();
      expect(r.won).toBe(true);
      expect(r.guesses).toBeLessThanOrEqual(7);
    }
  });

  test("bisection hears both HIGHER and LOWER", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const o = playAct2(freshAct2(), 50);
      if (o.kind === "hint") seen.add(o.hint);
    }
    expect(seen.has("higher")).toBe(true);
    expect(seen.has("lower")).toBe(true);
  });

  test("lucky first guess never wins", () => {
    for (let g = 1; g <= 100; g++) expect(playAct2(freshAct2(), g).kind).not.toBe("correct");
  });

  test("linear search fails and reveal is consistent with hints", () => {
    let s = freshAct2();
    let out;
    for (let g = 1; g <= 7; g++) {
      out = playAct2(s, g);
      s = out.state;
    }
    expect(out!.kind).toBe("failed");
    if (out!.kind === "failed") {
      for (const h of out!.state.guesses) {
        if (h.hint === "higher") expect(out!.reveal).toBeGreaterThan(h.guess);
        if (h.hint === "lower") expect(out!.reveal).toBeLessThan(h.guess);
      }
    }
  });

  test("random guessing essentially never wins", () => {
    let wins = 0;
    for (let i = 0; i < 2000; i++) {
      let s = freshAct2();
      for (let k = 0; k < 7; k++) {
        const g = s.lo + Math.floor(Math.random() * (s.hi - s.lo + 1));
        const o = playAct2(s, g);
        if (o.kind === "correct") wins++;
        if (o.kind !== "hint") break;
        s = o.state;
      }
    }
    expect(wins / 2000).toBeLessThan(0.2);
  });
});

describe("act3 colours", () => {
  const hexes = ["#1ED760", "#E50914", "#06C755", "#FFC72C", "#006241", "#000000", "#FFFFFF", "#5865F2", "#FF0000"];
  test("decoys are distinct, close, valid hex", () => {
    for (const h of hexes) {
      for (let i = 0; i < 50; i++) {
        const d = makeDecoys(h);
        expect(d.length).toBe(3);
        const all = [h, ...d];
        expect(new Set(all).size).toBe(4);
        for (const x of d) {
          expect(x).toMatch(/^#[0-9A-F]{6}$/);
          expect(deltaE(x, h)).toBeLessThan(0.2);
        }
      }
    }
  });
  test("round contains correct answer", () => {
    const s = freshAct3(hexes.map((hex, i) => ({ id: String(i), name: `B${i}`, hex })));
    expect(s.rounds.length).toBe(3);
    for (const r of s.rounds) expect(r.options[r.correct]).toBe(hexes[Number(r.brandId)]);
  });
});
