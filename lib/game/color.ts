/** sRGB hex <-> OKLCH helpers used to make near-identical decoy swatches. */

type Lab = { L: number; a: number; b: number };

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklab(hex: string): Lab {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToRgb({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);

/** OKLCH -> hex, reducing chroma until the colour fits in sRGB. */
export function oklchToHex(L: number, C: number, h: number): string {
  L = Math.min(0.99, Math.max(0.02, L));
  let c = Math.max(0, C);
  let rgb = oklabToRgb({ L, a: c * Math.cos(h), b: c * Math.sin(h) });
  while (!inGamut(rgb) && c > 0) {
    c -= 0.002;
    rgb = oklabToRgb({ L, a: c * Math.cos(h), b: c * Math.sin(h) });
  }
  return (
    "#" +
    rgb
      .map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))) * 255))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function deltaE(h1: string, h2: string) {
  const a = hexToOklab(h1);
  const b = hexToOklab(h2);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

/**
 * Three decoys that are close to `hex` but still distinguishable side by side
 * (OKLab ΔE between ~0.03 and ~0.09 from the real colour and from each other).
 */
export function makeDecoys(hex: string, rand: () => number = Math.random): string[] {
  const { L, a, b } = hexToOklab(hex);
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const out: string[] = [];
  const pick = (min: number, max: number) => (rand() < 0.5 ? -1 : 1) * (min + rand() * (max - min));

  for (let tries = 0; out.length < 3 && tries < 400; tries++) {
    const strategy = out.length % 3;
    const dL = strategy === 0 ? pick(0.04, 0.08) : pick(0, 0.02);
    const dH = strategy === 1 ? pick(0.07, 0.15) : pick(0, 0.04); // radians
    const dC = strategy === 2 ? pick(0.03, 0.06) : pick(0, 0.015);
    const cand = oklchToHex(L + dL, C + dC, h + dH);
    const de = deltaE(cand, hex);
    if (de < 0.03 || de > 0.12) continue;
    if (out.some((o) => deltaE(o, cand) < 0.025)) continue;
    out.push(cand);
  }
  // Fallback for awkward colours (near black/white/grey): lightness steps with a faint tint.
  const steps = [0.05, -0.05, 0.09, -0.09, 0.13, -0.13, 0.17, -0.17];
  const tints = [0, 0.02, 0.03];
  for (const tint of tints) {
    for (const dL of steps) {
      if (out.length >= 3) return out;
      const cand = oklchToHex(L + dL, C + tint, h + tint * 40);
      if (cand === hex.toUpperCase() || out.includes(cand) || deltaE(cand, hex) < 0.02) continue;
      out.push(cand);
    }
  }
  return out;
}
