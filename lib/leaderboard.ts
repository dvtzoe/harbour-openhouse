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

/**
 * A finished guest's leaderboard position (1 = fastest), using the same ranking as the leaderboard.
 * Null when the guest hasn't finished all 4 or is hidden from the leaderboard.
 */
export async function rankOf(guestId: string): Promise<number | null> {
  const row = await (await db())
    .prepare(
      `WITH t AS (
         SELECT g.id AS id, MAX(r.finished_at) - g.started_at AS total
         FROM guests g JOIN results r ON r.guest_id = g.id
         WHERE g.hidden = 0
         GROUP BY g.id
         HAVING COUNT(r.activity) = 4
       )
       SELECT (SELECT COUNT(*) FROM t WHERE t.total < me.total) + 1 AS rank FROM t AS me WHERE me.id = ?`,
    )
    .bind(guestId)
    .first<{ rank: number }>();
  return row?.rank ?? null;
}
