import { describe, expect, test } from "bun:test";
import { classifyCompletion } from "./completion";
import type { ReassignmentHistory } from "./completion";

const change: ReassignmentHistory = {
  fromUserId: 1, toUserId: 2, dueDate: "2026-11-10", occurredAt: "2026-11-10T15:00:00.000Z",
};

describe("overdue takeover classification", () => {
  test("starts at midnight in Japan on the day after the deadline", () => {
    expect(classifyCompletion([{ ...change, occurredAt: "2026-11-10T14:59:59.999Z" }], 2).classification).toBe("normal");
    expect(classifyCompletion([change], 2)).toEqual({
      classification: "overdue_takeover", takeoverFromUserId: 1,
      takeoverAt: change.occurredAt, takeoverDueDate: "2026-11-10",
    });
  });

  test("does not count unassigned, undated, unchanged, or pre-deadline assignments", () => {
    for (const input of [
      { ...change, fromUserId: null }, { ...change, toUserId: null },
      { ...change, dueDate: null }, { ...change, fromUserId: 2 },
      { ...change, dueDate: "2026-11-11" },
    ]) expect(classifyCompletion([input], 2).classification).toBe("normal");
  });

  test("does not count the original owner's completion after taking the task back", () => {
    const history = [change, { ...change, fromUserId: 2, toUserId: 1 }];
    expect(classifyCompletion(history, 1).classification).toBe("normal");
    expect(classifyCompletion([...history, change], 2).takeoverFromUserId).toBe(1);
  });

  test("does not guess the classification of old reassignment events", () => {
    const old = { fromUserId: 1, toUserId: 2, occurredAt: change.occurredAt };
    expect(classifyCompletion([old], 2).classification).toBe("unknown");
    expect(classifyCompletion([old, { ...change, fromUserId: 2, toUserId: 1 }], 1).classification).toBe("unknown");
  });
});
