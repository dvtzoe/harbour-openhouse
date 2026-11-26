import { db } from "./db";

export async function leaderboard(limit = 15) {
  const d = await db();
  const { results } = await d
    .prepare(
      `SELECT g.name AS name, MAX(r.finished_at) - g.started_at AS total
       FROM guests g JOIN results r ON r.guest_id = g.id
       WHERE g.hidden = 0
       GROUP BY g.id
       HAVING COUNT(r.activity) = 4
       ORDER BY total ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ name: string; total: number }>();
  const counts = await d
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM guests WHERE hidden = 0) AS players,
         (SELECT COUNT(*) FROM (SELECT r.guest_id FROM results r JOIN guests g ON g.id = r.guest_id WHERE g.hidden = 0 GROUP BY r.guest_id HAVING COUNT(*) = 4)) AS finishers`,
    )
    .first<{ players: number; finishers: number }>();
  return { rows: results, players: counts?.players ?? 0, finishers: counts?.finishers ?? 0 };
}
