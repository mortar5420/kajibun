import { recordTaskEvent } from "./repository";
import type { TaskDomainEvent } from "./events";

export async function dispatchTaskEvents(db: D1Database, events: TaskDomainEvent[]): Promise<void> {
  for (const event of events) {
    await recordTaskEvent(db, {
      taskId: event.taskId,
      actorUserId: event.actorUserId,
      eventType: event.type,
      payload: event.payload,
    });
  }
}
