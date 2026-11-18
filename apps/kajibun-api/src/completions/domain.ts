import type { CompletionClassification } from "../tasks/completion";
import { httpError } from "../shared/errors";

export type Completion = {
  id: string;
  taskId: string;
  title: string;
  performedByUserId: string | null;
  performedByName: string;
  performedAt: string;
  dueDate: string | null;
  classification: CompletionClassification;
  takeoverFromUserId: string | null;
  takeoverFromName: string | null;
  takeoverAt: string | null;
  takeoverDueDate: string | null;
};

export type CompletionUser = { userId: string | null; name: string };
export type CompletionCounts = { total: number; normal: number; overdueTakeover: number; unknown: number };

export function monthRange(month: string): { start: string; end: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1000) {
    throw httpError("invalid_month", "Month must be YYYY-MM", 400);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1, -9)).toISOString(),
    end: new Date(Date.UTC(year, monthNumber, 1, -9)).toISOString(),
  };
}

export function summarizeCompletions(completions: readonly Completion[], users: readonly CompletionUser[]) {
  const byUser = new Map(users.map((user) => [user.userId, { ...user, ...emptyCounts() }]));
  const byTask = new Map<string, { taskId: string; title: string } & CompletionCounts>();
  const totals = emptyCounts();
  for (const completion of completions) {
    const user = byUser.get(completion.performedByUserId) ?? {
      userId: completion.performedByUserId, name: completion.performedByName, ...emptyCounts(),
    };
    const task = byTask.get(completion.taskId) ?? {
      taskId: completion.taskId, title: completion.title, ...emptyCounts(),
    };
    for (const counts of [totals, user, task]) {
      counts.total++;
      if (completion.classification === "overdue_takeover") counts.overdueTakeover++;
      else if (completion.classification === "unknown") counts.unknown++;
      else counts.normal++;
    }
    byUser.set(user.userId, user);
    byTask.set(task.taskId, task);
  }
  return { totals, byUser: [...byUser.values()], byTask: [...byTask.values()] };
}

function emptyCounts(): CompletionCounts {
  return { total: 0, normal: 0, overdueTakeover: 0, unknown: 0 };
}
