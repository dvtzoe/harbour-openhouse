import { makeDecoys } from "./color";

export const ACT3_BRANDS_PER_ROUND = 3;

export interface Act3Round {
  brandId: string;
  name: string;
  options: string[]; // 4 hex swatches, shuffled
  correct: number;
}

export interface Act3State {
  rounds: Act3Round[];
  index: number; // current round
}

function shuffle<T>(arr: T[], rand: () => number) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function freshAct3(brands: { id: string; name: string; hex: string }[], rand: () => number = Math.random): Act3State {
  const chosen = shuffle(brands, rand).slice(0, ACT3_BRANDS_PER_ROUND);
  return {
    index: 0,
    rounds: chosen.map((b) => {
      const real = b.hex.toUpperCase();
      const options = shuffle([real, ...makeDecoys(real, rand)], rand);
      return { brandId: b.id, name: b.name, options, correct: options.indexOf(real) };
    }),
  };
}
