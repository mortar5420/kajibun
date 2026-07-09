import type { TaskRepository } from "./repository";
import type { TaskDomainEvent } from "./events";

export async function dispatchTaskEvents(repository: TaskRepository, events: TaskDomainEvent[]): Promise<void> {
  for (const event of events) {
    await repository.recordEvent({
      taskId: event.taskId,
      actorUserId: event.actorUserId,
      eventType: event.type,
      payload: event.payload,
    });
  }
}
