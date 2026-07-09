import { describe, expect, test } from "bun:test";
import type { Task } from "../tasks/domain";
import type { TaskRepository } from "../tasks/repository";
import type { TaskDomainEvent } from "../tasks/events";
import type { PushSender } from "./push-sender";
import type { NotificationRepository } from "./repository";
import {
  handleTaskNotificationEvent,
  sendDueTodayNotificationsUseCase,
} from "./service";
import type {
  NotificationJob,
  NotificationJobType,
  NotificationPayload,
  NotificationRecipient,
  PushSubscriptionRecord,
} from "./types";

describe("notification service", () => {
  test("sends task completion notifications with the job payload to users except the actor", async () => {
    const notificationRepository = new FakeNotificationRepository();
    notificationRepository.recipientsExceptActor = [
      { id: 2, email: "receiver@example.com" },
      { id: 3, email: "another@example.com" },
    ];
    notificationRepository.subscriptionsByUserId.set(2, [createSubscription(10, 2)]);
    notificationRepository.subscriptionsByUserId.set(3, [createSubscription(11, 3)]);
    const pushSender = new RecordingPushSender();
    const event: TaskDomainEvent = {
      type: "TaskCompleted",
      taskId: 100,
      actorUserId: 1,
      payload: {
        title: "トイレ掃除",
        fromStatus: "todo",
        toStatus: "done",
        clearedAssigneeUserId: null,
        nextDueDate: "2026-07-11",
      },
    };

    await handleTaskNotificationEvent(event, {
      notificationRepository,
      pushSender,
    });

    expect(notificationRepository.jobs.map((job) => job.recipientUserId)).toEqual([2, 3]);
    expect(pushSender.sent.map((sent) => sent.subscription.userId)).toEqual([2, 3]);
    expect(pushSender.sent.map((sent) => sent.payload)).toEqual([
      {
        title: "「トイレ掃除」が完了しました",
        body: "家事が完了しました。 次回の期限は2026-07-11です。",
        url: "/",
      },
      {
        title: "「トイレ掃除」が完了しました",
        body: "家事が完了しました。 次回の期限は2026-07-11です。",
        url: "/",
      },
    ]);
  });

  test("does not send due-today notifications for completed tasks", async () => {
    const taskRepository = new FakeTaskRepository([
      createTask({
        id: 1,
        title: "風呂掃除",
        status: "todo",
        dueDate: "2026-07-10",
      }),
      createTask({
        id: 2,
        title: "ゴミ出し",
        status: "done",
        dueDate: "2026-07-10",
      }),
    ]);
    const notificationRepository = new FakeNotificationRepository();
    notificationRepository.recipientsByAllowedEmail = [
      { id: 2, email: "receiver@example.com" },
      { id: 3, email: "another@example.com" },
    ];
    notificationRepository.subscriptionsByUserId.set(2, [createSubscription(10, 2)]);
    notificationRepository.subscriptionsByUserId.set(3, [createSubscription(11, 3)]);
    const pushSender = new RecordingPushSender();

    const result = await sendDueTodayNotificationsUseCase(
      taskRepository,
      notificationRepository,
      pushSender,
      "receiver@example.com,another@example.com",
      "12:00",
      "2026-07-10",
    );

    expect(result).toEqual({ sent: 2, failed: 0, pending: 0 });
    expect(notificationRepository.jobs.map((job) => job.taskId)).toEqual([1, 1]);
    expect(notificationRepository.jobs.map((job) => job.dedupeKey)).toEqual([
      "task_due_today:2026-07-10:12:00:1:2",
      "task_due_today:2026-07-10:12:00:1:3",
    ]);
    expect(pushSender.sent.map((sent) => sent.payload)).toEqual([
      {
        title: "今日が期限の家事があります",
        body: "「風呂掃除」の期限は今日です。",
        url: "/",
      },
      {
        title: "今日が期限の家事があります",
        body: "「風呂掃除」の期限は今日です。",
        url: "/",
      },
    ]);
  });
});

class FakeNotificationRepository implements NotificationRepository {
  recipientsExceptActor: NotificationRecipient[] = [];
  recipientsByAllowedEmail: NotificationRecipient[] = [];
  subscriptionsByUserId = new Map<number, PushSubscriptionRecord[]>();
  jobs: NotificationJob[] = [];
  sentJobIds: number[] = [];
  pendingJobIds: number[] = [];
  failedJobIds: number[] = [];

  async upsertSubscription(): Promise<void> {}

  async findUsersByEmails(): Promise<NotificationRecipient[]> {
    return this.recipientsByAllowedEmail;
  }

  async listUsersWithActiveSubscriptionsExcept(): Promise<NotificationRecipient[]> {
    return this.recipientsExceptActor;
  }

  async listActiveSubscriptionsByUserId(userId: number): Promise<PushSubscriptionRecord[]> {
    return this.subscriptionsByUserId.get(userId) ?? [];
  }

  async revokeSubscription(): Promise<void> {}

  async createJob(input: {
    type: NotificationJobType;
    recipientUserId: number;
    taskId: number | null;
    dedupeKey: string;
    payload: NotificationPayload;
  }): Promise<NotificationJob> {
    const job: NotificationJob = {
      id: this.jobs.length + 1,
      type: input.type,
      recipientUserId: input.recipientUserId,
      taskId: input.taskId,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      status: "pending",
      attempts: 0,
    };
    this.jobs.push(job);

    return job;
  }

  async findLatestSentJobByRecipient(): Promise<NotificationJob | null> {
    return null;
  }

  async listPendingJobs(): Promise<NotificationJob[]> {
    return [];
  }

  async markJobSent(jobId: number): Promise<void> {
    this.sentJobIds.push(jobId);
  }

  async markJobPending(jobId: number): Promise<void> {
    this.pendingJobIds.push(jobId);
  }

  async markJobFailed(jobId: number): Promise<void> {
    this.failedJobIds.push(jobId);
  }
}

class FakeTaskRepository implements TaskRepository {
  constructor(private readonly tasks: Task[]) {}

  async list(): Promise<Task[]> {
    return this.tasks;
  }

  async findById(): Promise<Task | null> {
    return null;
  }

  async insert(): Promise<number> {
    return 1;
  }

  async updateDetails(): Promise<void> {}

  async markDeleted(): Promise<void> {}

  async updateAssignee(): Promise<void> {}

  async updateStatus(): Promise<void> {}

  async findUserById(): Promise<null> {
    return null;
  }

  async findUserByEmail(): Promise<null> {
    return null;
  }

  async recordEvent(): Promise<void> {}
}

class RecordingPushSender implements PushSender {
  sent: Array<{ subscription: PushSubscriptionRecord; payload: NotificationPayload }> = [];

  async send(subscription: PushSubscriptionRecord, payload: NotificationPayload): Promise<{ ok: true }> {
    this.sent.push({ subscription, payload });

    return { ok: true };
  }
}

function createTask(input: Pick<Task, "id" | "title" | "status" | "dueDate">): Task {
  return {
    id: input.id,
    title: input.title,
    description: null,
    status: input.status,
    dueDate: input.dueDate,
    intervalDays: 1,
    assigneeUserId: null,
    assigneeEmail: null,
    assigneeName: null,
    assigneePictureUrl: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
}

function createSubscription(id: number, userId: number): PushSubscriptionRecord {
  return {
    id,
    userId,
    endpoint: `https://push.example.test/${id}`,
    p256dh: "p256dh",
    auth: "auth",
    userAgent: "test",
  };
}
