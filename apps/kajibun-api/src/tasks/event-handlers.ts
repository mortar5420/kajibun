import type { SqlClient } from "../db/client";
import { recordTaskEvent } from "./repository";
import type { TaskDomainEvent } from "./events";

export async function dispatchTaskEvents(db: SqlClient, events: TaskDomainEvent[]): Promise<void> {
  for (const event of events) {
    await recordTaskEvent(db, {
      taskId: event.taskId,
      actorUserId: event.actorUserId,
      eventType: event.type,
      payload: event.payload,
    });
  }
}
