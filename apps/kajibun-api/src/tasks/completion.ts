import { getTodayDateString } from "../shared/date";

export type CompletionClassification = "normal" | "overdue_takeover" | "unknown";

export type ReassignmentHistory = {
  fromUserId: number | null;
  toUserId: number | null;
  // Missing on events written before completion tracking was introduced.
  dueDate?: string | null;
  occurredAt: string;
};

export type TakeoverDetails = {
  classification: CompletionClassification;
  takeoverFromUserId: number | null;
  takeoverAt: string | null;
  takeoverDueDate: string | null;
};

export type CompletionRecord = TakeoverDetails & {
  id: string;
  taskId: number;
  performedByUserId: number;
  performedAt: string;
  taskTitleSnapshot: string;
  dueDateSnapshot: string | null;
};

export function classifyCompletion(history: readonly ReassignmentHistory[], performerUserId: number): TakeoverDetails {
  let hasUnknownHistory = false;
  for (const change of history) {
    if (change.fromUserId === change.toUserId) continue;
    if (change.dueDate === undefined) {
      hasUnknownHistory = true;
      continue;
    }
    if (
      change.fromUserId === null || change.toUserId === null || change.dueDate === null ||
      change.dueDate >= getTodayDateString(new Date(change.occurredAt))
    ) continue;

    // Keep the first overdue owner's identity, even after another reassignment
    // or deadline edit. Returning to that owner is not a completed takeover.
    return {
      classification: hasUnknownHistory ? "unknown" :
        change.fromUserId === performerUserId ? "normal" : "overdue_takeover",
      takeoverFromUserId: change.fromUserId,
      takeoverAt: change.occurredAt,
      takeoverDueDate: change.dueDate,
    };
  }
  return {
    classification: hasUnknownHistory ? "unknown" : "normal",
    takeoverFromUserId: null,
    takeoverAt: null,
    takeoverDueDate: null,
  };
}
