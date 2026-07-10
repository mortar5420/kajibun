import type { TaskRepository } from "./repository";
import type { PersistedTaskDomainEvent, TaskDomainEvent } from "./events";

export type TaskEventHandler = (event: PersistedTaskDomainEvent) => Promise<void>;

export async function dispatchTaskEvents(
  repository: TaskRepository,
  events: TaskDomainEvent[],
  handlers: TaskEventHandler[] = [],
): Promise<void> {
  for (const event of events) {
    const eventId = await repository.recordEvent({
      taskId: event.taskId,
      actorUserId: event.actorUserId,
      eventType: event.type,
      payload: event.payload,
    });
    const persistedEvent = {
      ...event,
      eventId,
    };

    for (const handler of handlers) {
      await handler(persistedEvent);
    }
  }
}
