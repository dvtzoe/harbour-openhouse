"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDuration } from "@/lib/format";
import { Box, EVENT_NAME, TopBar } from "../components/dos";
import { api, useLive } from "../components/hooks";

type Board = { rows: { name: string; total: number }[]; players: number; finishers: number };

export default function LeaderboardClient() {
  const [board, setBoard] = useState<Board | null>(null);
  const [flash, setFlash] = useState(false);

  const load = useCallback(async () => {
    try {
      const b = await api<Board>("/api/leaderboard", { cache: "no-store" });
      setBoard((prev) => {
        if (prev && JSON.stringify(prev.rows) !== JSON.stringify(b.rows)) {
          setFlash(true);
          setTimeout(() => setFlash(false), 1500);
        }
        return b;
      });
    } catch (e) {
      if ((e as Error).message.includes("Staff login")) location.href = "/login?next=/leaderboard";
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLive("leaderboard", load);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar right={board ? `${board.finishers} FINISHED / ${board.players} PLAYERS` : ""} />
      <main className="flex flex-1 flex-col items-center gap-6 p-6">
        <h1 className="text-center text-4xl font-bold text-dos-yellow md:text-6xl">★ HIGH SCORES ★</h1>
        <p className="text-dos-gray">{EVENT_NAME} — total time across all 4 challenges</p>
        <Box title="TOP PLAYERS" className={`w-full max-w-4xl ${flash ? "outline outline-4 outline-dos-yellow" : ""}`}>
          {!board ? (
            <p className="blink">LOADING...</p>
          ) : board.rows.length === 0 ? (
            <p className="py-8 text-center text-2xl text-dos-gray">NO FINISHERS YET — BE THE FIRST!</p>
          ) : (
            <table className="w-full text-2xl md:text-3xl">
              <tbody>
                {board.rows.map((r, i) => (
                  <tr key={r.name} className={i === 0 ? "text-dos-yellow" : i < 3 ? "text-dos-brcyan" : ""}>
                    <td className="w-20 py-1 pr-4 text-right">{String(i + 1).padStart(2, "0")}.</td>
                    <td className="py-1">{r.name.toUpperCase()}</td>
                    <td className="py-1 text-right tabular-nums">{fmtDuration(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Box>
      </main>
    </div>
  );
}
