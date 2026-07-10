import type { TaskStatus } from "./types";

export type TaskDomainEvent =
  | {
      type: "TaskCreated";
      taskId: number;
      actorUserId: number;
      payload: {
        title: string;
        dueDate: string | null;
        intervalDays: number;
      };
    }
  | {
      type: "TaskUpdated";
      taskId: number;
      actorUserId: number;
      payload: {
        from: {
          title: string;
          description: string | null;
          dueDate: string | null;
          intervalDays: number;
        };
        to: {
          title: string;
          description: string | null;
          dueDate: string | null;
          intervalDays: number;
        };
      };
    }
  | {
      type: "TaskDeleted";
      taskId: number;
      actorUserId: number;
      payload: {
        title: string;
        description: string | null;
        dueDate: string | null;
        intervalDays: number;
        status: TaskStatus;
        assigneeUserId: number | null;
      };
    }
  | {
      type: "TaskReassigned";
      taskId: number;
      actorUserId: number;
      payload: {
        fromUserId: number | null;
        toUserId: number | null;
      };
    }
  | {
      type: "TaskCompleted" | "TaskReopened";
      taskId: number;
      actorUserId: number;
      payload: {
        title: string;
        fromStatus: TaskStatus;
        toStatus: TaskStatus;
        clearedAssigneeUserId: number | null;
        nextDueDate: string | null;
      };
    };

export type PersistedTaskDomainEvent = TaskDomainEvent & {
  eventId: number;
};
