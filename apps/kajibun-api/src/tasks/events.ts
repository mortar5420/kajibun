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
      type: "TaskCompleted";
      taskId: number;
      actorUserId: number;
      payload: {
        title: string;
        fromAssigneeUserId: number | null;
        toAssigneeUserId: number;
        nextDueDate: string | null;
      };
    };

export type PersistedTaskDomainEvent = TaskDomainEvent & {
  eventId: number;
};
