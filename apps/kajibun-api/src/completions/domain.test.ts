import { afterEach, describe, expect, test } from "bun:test";
import { monthRange, summarizeCompletions } from "./domain";
import { createCompletionRepository } from "./repository";
import { createTestDatabase } from "../test/database";

const databases: ReturnType<typeof createTestDatabase>["database"][] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

describe("monthly completion reporting", () => {
  test("uses Japan month boundaries including leap years and December", () => {
    expect(monthRange("2026-11")).toEqual({ start: "2026-10-31T15:00:00.000Z", end: "2026-11-30T15:00:00.000Z" });
    expect(monthRange("2024-02")).toEqual({ start: "2024-01-31T15:00:00.000Z", end: "2024-02-29T15:00:00.000Z" });
    expect(monthRange("2026-12").end).toBe("2026-12-31T15:00:00.000Z");
    for (const month of ["", "2026-00", "2026-13", "2026-1", "26-11", "2026-11-01", "2026-11' OR 1=1"]) {
      let status: number | undefined;
      try { monthRange(month); } catch (error) { status = (error as { status: number }).status; }
      expect(status).toBe(400);
    }
  });

  test("migrates old completions including deleted tasks with unknown classification and original titles", async () => {
    const { database, client } = createTestDatabase((db) => {
      db.exec(`INSERT INTO tasks (id, title, deleted_at) VALUES (100, '改名後', datetime('now'));
        INSERT INTO task_events (id, task_id, event_type, actor_user_id, payload_json, created_at) VALUES
        (50, 100, 'TaskCompleted', 1, '{"title":"当時の名前"}', '2026-10-31 15:00:00'),
        (51, 100, 'TaskCompleted', NULL, '{}', '2026-11-30 14:59:59');`);
    });
    databases.push(database);
    const repository = createCompletionRepository(client);
    const { start, end } = monthRange("2026-11");
    const records = await repository.listInRange(start, end);
    expect(records).toHaveLength(2);
    expect(records[1].title).toBe("当時の名前");
    expect(records[1].performedAt).toBe("2026-10-31T15:00:00.000Z");
    expect(records[0].performedByName).toBe("不明なユーザ");
    expect(records[0].dueDate).toBe(null);
    const summary = summarizeCompletions(records, await repository.listUsers());
    expect(summary.totals).toEqual({ total: 2, normal: 0, overdueTakeover: 0, unknown: 2 });
    expect(summary.byUser.find((user) => user.userId === "2")?.total).toBe(0);
    expect(summary.byUser.find((user) => user.userId === null)?.unknown).toBe(1);
  });

  test("includes the start, excludes the end, and treats takeovers as part of total counts", async () => {
    const { database, client } = createTestDatabase();
    databases.push(database);
    database.exec("INSERT INTO tasks (id, title, deleted_at) VALUES (100, '現在の名前', datetime('now'))");
    const insert = database.query(`INSERT INTO task_completions
      (id, task_id, task_title_snapshot, performed_by_user_id, performed_at, classification, takeover_at, takeover_due_date)
      VALUES (?, 100, '当時の名前', ?, ?, ?, ?, ?)`);
    insert.run("before", 1, "2026-10-31T14:59:59.999Z", "normal", null, null);
    insert.run("start", 1, "2026-10-31T15:00:00.000Z", "normal", null, null);
    insert.run("takeover", 2, "2026-11-30T14:59:59.999Z", "overdue_takeover", "2026-11-29T00:00:00.000Z", "2026-11-28");
    insert.run("end", 2, "2026-11-30T15:00:00.000Z", "normal", null, null);
    const repository = createCompletionRepository(client);
    const { start, end } = monthRange("2026-11");
    const records = await repository.listInRange(start, end);
    expect(records.map((record) => record.id)).toEqual(["takeover", "start"]);
    expect(records[0].title).toBe("当時の名前");
    const summary = summarizeCompletions(records, await repository.listUsers());
    expect(summary.totals).toEqual({ total: 2, normal: 1, overdueTakeover: 1, unknown: 0 });
    expect(summary.byTask).toEqual([{ taskId: "100", title: "当時の名前", ...summary.totals }]);
    expect(summary.byUser.map((user) => user.total)).toEqual([1, 1]);
    expect(summary.byUser[1].overdueTakeover).toBe(1);
  });
});
