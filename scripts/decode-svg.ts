// Generates DECODE.EXE puzzle images.
//
// Each uppercase letter becomes a square split along its 4 lines of symmetry
// into 8 right triangles. Starting just right of 12 o'clock and going
// clockwise, triangle 1..8 = ASCII bit 7..0 (MSB first). Filled = 1, hollow = 0.
//
//   +---------------+
//   |\  8   |   1  /|      A = 0x41 = 01000001
//   |  \    |    /  |      -> triangles 2 and 8 filled
//   | 7  \  |  /  2 |
//   |------ + ------|
//   | 6  /  |  \  3 |
//   |  /    |    \  |
//   |/  5   |   4  \|
//   +---------------+
//
// Usage: bun scripts/decode-svg.ts wordlist.txt
//   One image per line -> decode-svg/NN-<ANSWER>.svg. Spaces start a new row
//   of glyphs and are dropped from the answer.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const CELL = 100; // glyph size
const GAP = 0; // space between glyphs
const PAD = 30; // outer margin
const STROKE = 3;

const CUT = 12; // how far (out of 100) each corner is cut back along both edges

// The square's corners are cut, making a slightly octagonal glyph. With no
// gap between glyphs, the cut corners of 4 neighbours form a small diamond.
// Shapes are in a 100x100 square, clockwise from 12 o'clock. Each corner's
// two triangles lose a sliver, split where the diagonal meets the cut.
const MIDS: [number, number][] = [[50, 0], [100, 50], [50, 100], [0, 50]]; // top, right, bottom, left
const CORNERS: [number, number][] = [[100, 0], [100, 100], [0, 100], [0, 0]]; // TR, BR, BL, TL
const C: [number, number] = [50, 50];
const toward = ([x, y]: [number, number], [tx, ty]: [number, number], d: number): [number, number] => {
  const len = Math.hypot(tx - x, ty - y);
  return [x + ((tx - x) * d) / len, y + ((ty - y) * d) / len];
};
const SHAPES: [number, number][][] = CORNERS.flatMap((corner, k) => {
  const from = MIDS[k];
  const to = MIDS[(k + 1) % 4];
  const a = toward(corner, from, CUT);
  const b = toward(corner, to, CUT);
  const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return [
    [from, a, m, C],
    [m, b, to, C],
  ];
});

export function glyph(ch: string, x: number, y: number): string {
  const code = ch.charCodeAt(0);
  return SHAPES.map((tri, i) => {
    const on = (code >> (7 - i)) & 1;
    const pts = tri.map(([px, py]) => `${x + (px * CELL) / 100},${y + (py * CELL) / 100}`).join(" ");
    return `<polygon points="${pts}" fill="${on ? "#fff" : "none"}"/>`;
  }).join("");
}

const ROW_GAP = 0; // space between rows

// One image per line; each space-separated word becomes its own row.
// The answer is the line with whitespace removed.
export function lineSvg(line: string): { answer: string; svg: string } {
  const rows = line.toUpperCase().trim().split(/\s+/).filter(Boolean);
  for (const r of rows) if (!/^[A-Z]+$/.test(r)) throw new Error(`"${line}": letters A-Z only`);
  const cols = Math.max(...rows.map((r) => r.length));
  const width = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const height = PAD * 2 + rows.length * CELL + (rows.length - 1) * ROW_GAP;
  const glyphs = rows
    .flatMap((r, ri) => [...r].map((ch, i) => glyph(ch, PAD + i * (CELL + GAP), PAD + ri * (CELL + ROW_GAP))))
    .join("\n  ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <g stroke="#fff" stroke-width="${STROKE}" stroke-linejoin="miter">
  ${glyphs}
  </g>
</svg>
`;
  return { answer: rows.join(""), svg };
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: bun scripts/decode-svg.ts wordlist.txt");
    process.exit(1);
  }
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  mkdirSync("decode-svg", { recursive: true });
  lines.forEach((line, i) => {
    const { answer, svg } = lineSvg(line);
    const out = `decode-svg/${String(i + 1).padStart(2, "0")}-${answer}.svg`;
    writeFileSync(out, svg);
    console.log(`${out}  answer: ${answer}`);
  });
}
