import { afterEach, describe, expect, test } from "bun:test";
import type { CurrentUser } from "../auth/types";
import { createTestDatabase } from "../test/database";
import { createSqlTaskRepository } from "./repository";
import { completeTaskUseCase, reassignTaskUseCase, updateTaskUseCase, deleteTaskUseCase } from "./service";
import type { PersistedTaskDomainEvent } from "./events";

const allowedEmails = "a@example.test,b@example.test";
const a: CurrentUser = { id: 1, googleSub: "user-a", email: "a@example.test" };
const b: CurrentUser = { id: 2, googleSub: "user-b", email: "b@example.test" };
const databases: ReturnType<typeof createTestDatabase>["database"][] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

async function setup(dueDate: string | null = "2000-01-01") {
  const { database, client } = createTestDatabase();
  databases.push(database);
  const repository = createSqlTaskRepository(client);
  const id = await repository.insert({ title: "風呂掃除", description: null, dueDate, intervalDays: 2 });
  await reassignTaskUseCase(repository, allowedEmails, a, id, { assigneeUserId: a.id });
  const readTask = async () => {
    const task = await repository.findById(id);
    if (!task) throw new Error("Missing test task");
    return task;
  };
  const count = (table: "task_completions" | "task_events") => database.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n;
  return { repository, database, id, readTask, count, client };
}

describe("task completion persistence", () => {
  test("records a takeover and its event atomically before notifying the next assignee", async () => {
    const { repository, database, id, readTask, count } = await setup();
    await reassignTaskUseCase(repository, allowedEmails, b, id, { assigneeUserId: b.id });
    const before = await readTask();
    const notifications: PersistedTaskDomainEvent[] = [];
    const updated = await completeTaskUseCase(repository, allowedEmails, b, id, before.version, {
      eventHandlers: [async (event) => {
        expect(count("task_completions")).toBe(1);
        notifications.push(event);
      }],
    });
    expect(updated.assigneeUserId).toBe(a.id);
    expect(updated.version).toBe(before.version + 1);
    expect(count("task_completions")).toBe(1);
    const record = database.query<{ id: string; classification: string; takeover_from_user_id: number; due_date_snapshot: string; performed_by_user_id: number; task_title_snapshot: string }>("SELECT * FROM task_completions").get();
    if (!record) throw new Error("Missing completion record");
    expect(record?.classification).toBe("overdue_takeover");
    expect(record?.takeover_from_user_id).toBe(a.id);
    expect(record?.performed_by_user_id).toBe(b.id);
    expect(record?.due_date_snapshot).toBe("2000-01-01");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("TaskCompleted");
    if (notifications[0].type === "TaskCompleted") expect(notifications[0].payload.completionId).toBe(record.id);
  });

  test("keeps the deadline at takeover even after editing it, and retains records after renaming/deleting", async () => {
    const { repository, database, id, readTask } = await setup();
    await reassignTaskUseCase(repository, allowedEmails, b, id, { assigneeUserId: b.id });
    await updateTaskUseCase(repository, b, id, { dueDate: "2999-01-01" });
    await completeTaskUseCase(repository, allowedEmails, b, id, (await readTask()).version);
    await updateTaskUseCase(repository, a, id, { title: "変更後の家事名" });
    await deleteTaskUseCase(repository, a, id);
    expect(database.query("SELECT task_title_snapshot, classification, due_date_snapshot, takeover_due_date FROM task_completions").get()).toEqual({
      task_title_snapshot: "風呂掃除", classification: "overdue_takeover",
      due_date_snapshot: "2999-01-01", takeover_due_date: "2000-01-01",
    });
  });

  test("starts a new history after each completion and does not carry a previous takeover forward", async () => {
    const { repository, database, id, readTask } = await setup();
    await reassignTaskUseCase(repository, allowedEmails, b, id, { assigneeUserId: b.id });
    await completeTaskUseCase(repository, allowedEmails, b, id, (await readTask()).version);
    expect(await repository.listCurrentReassignments(id)).toEqual([]);
    await completeTaskUseCase(repository, allowedEmails, a, id, (await readTask()).version);
    expect(database.query<{ classification: string }>("SELECT classification FROM task_completions ORDER BY rowid").all()).toEqual([
      { classification: "overdue_takeover" }, { classification: "normal" },
    ]);
  });

  test("counts pre-deadline transfers and an overdue owner's own completion as normal", async () => {
    for (const dueDate of ["2999-01-01", null]) {
      const { repository, database, id, readTask } = await setup(dueDate);
      await reassignTaskUseCase(repository, allowedEmails, b, id, { assigneeUserId: b.id });
      await completeTaskUseCase(repository, allowedEmails, b, id, (await readTask()).version);
      expect(database.query<{ classification: string }>("SELECT classification FROM task_completions").get()?.classification).toBe("normal");
    }
    const { repository, database, id, readTask } = await setup();
    await reassignTaskUseCase(repository, allowedEmails, b, id, { assigneeUserId: b.id });
    await reassignTaskUseCase(repository, allowedEmails, a, id, { assigneeUserId: a.id });
    await completeTaskUseCase(repository, allowedEmails, a, id, (await readTask()).version);
    expect(database.query<{ classification: string }>("SELECT classification FROM task_completions").get()?.classification).toBe("normal");
  });

  test("rejects stale and concurrent completions without counting them twice", async () => {
    const { repository, id, readTask, count } = await setup();
    const task = await readTask();
    const results = await Promise.allSettled([
      completeTaskUseCase(repository, allowedEmails, a, id, task.version),
      completeTaskUseCase(repository, allowedEmails, a, id, task.version),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(count("task_completions")).toBe(1);
    const retry = await completeTaskUseCase(repository, allowedEmails, a, id, task.version).catch((error) => error);
    expect(retry.status).toBe(409);
    expect(count("task_completions")).toBe(1);
  });

  test("rejects non-assignee completion without changing the task", async () => {
    const { repository, id, readTask, count } = await setup();
    const task = await readTask();
    const error = await completeTaskUseCase(repository, allowedEmails, b, id, task.version).catch((cause) => cause);
    expect(error.status).toBe(403);
    expect(await readTask()).toEqual(task);
    expect(count("task_completions")).toBe(0);
  });

  test("rolls back the task and completion record if the completion event cannot be saved", async () => {
    const { repository, database, id, readTask, count } = await setup();
    const task = await readTask();
    const eventCount = count("task_events");
    database.exec(`CREATE TRIGGER fail_completion_event BEFORE INSERT ON task_events
      WHEN NEW.event_type = 'TaskCompleted' BEGIN SELECT RAISE(ABORT, 'simulated event failure'); END`);
    let notified = false;
    const error = await completeTaskUseCase(repository, allowedEmails, a, id, task.version, {
      eventHandlers: [async () => { notified = true; }],
    }).catch((cause) => cause);
    expect(error).toBeInstanceOf(Error);
    expect(await readTask()).toEqual(task);
    expect(count("task_completions")).toBe(0);
    expect(count("task_events")).toBe(eventCount);
    expect(notified).toBe(false);
  });

  test("rolls back reassignment on event failure and rejects a stale write without leaving an event", async () => {
    const { repository, database, id, readTask, count } = await setup();
    const task = await readTask();
    database.exec(`CREATE TRIGGER fail_reassignment BEFORE INSERT ON task_events
      WHEN NEW.event_type = 'TaskReassigned' BEGIN SELECT RAISE(ABORT, 'simulated reassignment failure'); END`);
    const failed = await reassignTaskUseCase(repository, allowedEmails, b, id, { assigneeUserId: b.id }).catch((cause) => cause);
    expect(failed).toBeInstanceOf(Error);
    expect(await readTask()).toEqual(task);
    database.exec("DROP TRIGGER fail_reassignment");
    await updateTaskUseCase(repository, a, id, { title: "新しい名前" });
    const events = count("task_events");
    const stale = await repository.saveChange(task, { type: "delete" }, {
      type: "TaskDeleted", taskId: id, actorUserId: a.id,
      payload: { title: task.title, description: null, dueDate: task.dueDate, intervalDays: 2, assigneeUserId: 1 },
    }).catch((cause) => cause);
    expect(stale.status).toBe(409);
    expect(count("task_events")).toBe(events);
    expect((await readTask()).title).toBe("新しい名前");
  });
});
