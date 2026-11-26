// Pure helpers shared by server and client (no DB imports).

export const TASK_ORDER = [1, 2, 3, 4] as const;
export type TaskId = (typeof TASK_ORDER)[number];
export type Finished = Partial<Record<TaskId, number>>;

/** The task the guest must solve next, or null when all 4 are done. */
export function currentTask(finished: Finished): TaskId | null {
  return TASK_ORDER.find((t) => !finished[t]) ?? null;
}

/**
 * When a task's own timer started: the name pick for task 1, otherwise the
 * moment the previous task was solved. Uses the latest earlier finish so
 * players who started before tasks became sequential never get a negative time.
 */
export function taskStart(startedAt: number, finished: Finished, task: TaskId): number {
  let start = startedAt;
  for (const t of TASK_ORDER) {
    if (t >= task) break;
    const f = finished[t];
    if (f && f > start) start = f;
  }
  return start;
}

/** Duration of a solved task, or null if it isn't solved yet. */
export function taskDuration(startedAt: number, finished: Finished, task: TaskId): number | null {
  const f = finished[task];
  return f ? Math.max(0, f - taskStart(startedAt, finished, task)) : null;
}

/** The task after `task` in the fixed order, or null after the last one. */
export function nextTask(task: TaskId): TaskId | null {
  return TASK_ORDER[TASK_ORDER.indexOf(task) + 1] ?? null;
}
