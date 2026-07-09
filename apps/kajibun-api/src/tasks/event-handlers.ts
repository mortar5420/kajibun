import type { TaskRepository } from "./repository";
import type { TaskDomainEvent } from "./events";

export type TaskEventHandler = (event: TaskDomainEvent) => Promise<void>;

export async function dispatchTaskEvents(
  repository: TaskRepository,
  events: TaskDomainEvent[],
  handlers: TaskEventHandler[] = [],
): Promise<void> {
  for (const event of events) {
    await repository.recordEvent({
      taskId: event.taskId,
      actorUserId: event.actorUserId,
      eventType: event.type,
      payload: event.payload,
    });

    for (const handler of handlers) {
      await handler(event);
    }
  }
}
