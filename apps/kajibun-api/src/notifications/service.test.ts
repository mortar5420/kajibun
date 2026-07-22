import { describe, expect, test } from "bun:test";
import type { Task } from "../tasks/domain";
import type { TaskRepository } from "../tasks/repository";
import type { PersistedTaskDomainEvent } from "../tasks/events";
import type { PushSender } from "./push-sender";
import type { NotificationRepository } from "./repository";
import {
  handleTaskNotificationEvent,
  sendDueTodayNotificationsUseCase,
  subscribePushUseCase,
} from "./service";
import type {
  NotificationJob,
  NotificationJobType,
  NotificationPayload,
  NotificationRecipient,
  PushSubscriptionRecord,
} from "./types";

describe("notification service", () => {
  test("replaces a user's existing subscriptions when subscribing push", async () => {
    const notificationRepository = new FakeNotificationRepository();
    notificationRepository.subscriptionsByUserId.set(1, [
      createSubscription(1, 1),
      createSubscription(3, 1),
    ]);

    await subscribePushUseCase(
      notificationRepository,
      {
        id: 1,
        googleSub: "google-sub-1",
        email: "receiver@example.com",
        name: "Receiver",
        pictureUrl: undefined,
      },
      {
        endpoint: "https://push.example.test/current",
        keys: {
          p256dh: "current-p256dh",
          auth: "current-auth",
        },
      },
      "current-agent",
    );

    expect(notificationRepository.subscriptionsByUserId.get(1)).toEqual([
      {
        id: 4,
        userId: 1,
        endpoint: "https://push.example.test/current",
        p256dh: "current-p256dh",
        auth: "current-auth",
        userAgent: "current-agent",
      },
    ]);
  });

  test("sends task completion notifications with the job payload to users except the actor", async () => {
    const notificationRepository = new FakeNotificationRepository();
    notificationRepository.recipientsExceptActor = [
      { id: 2, email: "receiver@example.com" },
      { id: 3, email: "another@example.com" },
    ];
    notificationRepository.subscriptionsByUserId.set(2, [createSubscription(10, 2)]);
    notificationRepository.subscriptionsByUserId.set(3, [createSubscription(11, 3)]);
    const pushSender = new RecordingPushSender();
    const event: PersistedTaskDomainEvent = {
      eventId: 501,
      type: "TaskCompleted",
      taskId: 100,
      actorUserId: 1,
      payload: {
        title: "トイレ掃除",
        fromAssigneeUserId: 1,
        toAssigneeUserId: 2,
        nextDueDate: "2026-07-11",
      },
    };

    await handleTaskNotificationEvent(event, {
      notificationRepository,
      pushSender,
    });

    expect(notificationRepository.jobs.map((job) => job.recipientUserId)).toEqual([2, 3]);
    expect(notificationRepository.jobs.map((job) => job.dedupeKey)).toEqual([
      "task_completed:501:2",
      "task_completed:501:3",
    ]);
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

  test("sends task completion notifications for each persisted completion event", async () => {
    const notificationRepository = new FakeNotificationRepository();
    notificationRepository.recipientsExceptActor = [{ id: 2, email: "receiver@example.com" }];
    notificationRepository.subscriptionsByUserId.set(2, [createSubscription(10, 2)]);
    const pushSender = new RecordingPushSender();
    const firstEvent = createCompletedEvent({ eventId: 601, taskId: 100 });
    const secondEvent = createCompletedEvent({ eventId: 602, taskId: 100 });

    await handleTaskNotificationEvent(firstEvent, {
      notificationRepository,
      pushSender,
    });
    await handleTaskNotificationEvent(secondEvent, {
      notificationRepository,
      pushSender,
    });

    expect(notificationRepository.jobs.map((job) => job.dedupeKey)).toEqual([
      "task_completed:601:2",
      "task_completed:602:2",
    ]);
    expect(pushSender.sent).toHaveLength(2);
  });

  test("sends a notification job to every active subscription for the recipient", async () => {
    const notificationRepository = new FakeNotificationRepository();
    notificationRepository.recipientsExceptActor = [{ id: 2, email: "receiver@example.com" }];
    notificationRepository.subscriptionsByUserId.set(2, [
      createSubscription(10, 2),
      createSubscription(12, 2),
      createSubscription(14, 2),
    ]);
    const pushSender = new RecordingPushSender();

    await handleTaskNotificationEvent(createCompletedEvent({ eventId: 603, taskId: 100 }), {
      notificationRepository,
      pushSender,
    });

    expect(pushSender.sent.map((sent) => sent.subscription.id)).toEqual([10, 12, 14]);
    expect(notificationRepository.sentJobIds).toEqual([1]);
  });

  test("does not resend task completion notifications when the same persisted event is processed again", async () => {
    const notificationRepository = new FakeNotificationRepository();
    notificationRepository.recipientsExceptActor = [{ id: 2, email: "receiver@example.com" }];
    notificationRepository.subscriptionsByUserId.set(2, [createSubscription(10, 2)]);
    const pushSender = new RecordingPushSender();
    const event = createCompletedEvent({ eventId: 701, taskId: 100 });

    await handleTaskNotificationEvent(event, {
      notificationRepository,
      pushSender,
    });
    await handleTaskNotificationEvent(event, {
      notificationRepository,
      pushSender,
    });

    expect(notificationRepository.jobs.map((job) => job.dedupeKey)).toEqual(["task_completed:701:2"]);
    expect(pushSender.sent).toHaveLength(1);
  });

  test("sends due-today notifications for tasks with a due date", async () => {
    const taskRepository = new FakeTaskRepository([
      createTask({
        id: 1,
        title: "風呂掃除",
        dueDate: "2026-07-10",
      }),
      createTask({
        id: 2,
        title: "ゴミ出し",
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

    expect(result).toEqual({ sent: 4, failed: 0, pending: 0 });
    expect(notificationRepository.jobs.map((job) => job.taskId)).toEqual([1, 1, 2, 2]);
    expect(notificationRepository.jobs.map((job) => job.dedupeKey)).toEqual([
      "task_due_today:2026-07-10:12:00:1:2",
      "task_due_today:2026-07-10:12:00:1:3",
      "task_due_today:2026-07-10:12:00:2:2",
      "task_due_today:2026-07-10:12:00:2:3",
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
      {
        title: "今日が期限の家事があります",
        body: "「ゴミ出し」の期限は今日です。",
        url: "/",
      },
      {
        title: "今日が期限の家事があります",
        body: "「ゴミ出し」の期限は今日です。",
        url: "/",
      },
    ]);
  });

  test("sends due notifications for overdue tasks", async () => {
    const taskRepository = new FakeTaskRepository([
      createTask({
        id: 1,
        title: "玄関掃除",
        dueDate: "2026-07-09",
      }),
      createTask({
        id: 2,
        title: "買い出し",
        dueDate: "2026-07-09",
      }),
      createTask({
        id: 3,
        title: "洗濯",
        dueDate: "2026-07-11",
      }),
    ]);
    const notificationRepository = new FakeNotificationRepository();
    notificationRepository.recipientsByAllowedEmail = [{ id: 2, email: "receiver@example.com" }];
    notificationRepository.subscriptionsByUserId.set(2, [createSubscription(10, 2)]);
    const pushSender = new RecordingPushSender();

    const result = await sendDueTodayNotificationsUseCase(
      taskRepository,
      notificationRepository,
      pushSender,
      "receiver@example.com",
      "18:00",
      "2026-07-10",
    );

    expect(result).toEqual({ sent: 2, failed: 0, pending: 0 });
    expect(notificationRepository.jobs.map((job) => job.taskId)).toEqual([1, 2]);
    expect(notificationRepository.jobs.map((job) => job.dedupeKey)).toEqual([
      "task_due_today:2026-07-10:18:00:1:2",
      "task_due_today:2026-07-10:18:00:2:2",
    ]);
    expect(pushSender.sent.map((sent) => sent.payload)).toEqual([
      {
        title: "期限を過ぎた家事があります",
        body: "「玄関掃除」の期限（2026-07-09）を過ぎています。",
        url: "/",
      },
      {
        title: "期限を過ぎた家事があります",
        body: "「買い出し」の期限（2026-07-09）を過ぎています。",
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

  async replaceSubscriptionsForUser(input: {
    userId: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
  }): Promise<void> {
    this.subscriptionsByUserId.set(input.userId, [
      {
        id: this.nextSubscriptionId(input.userId),
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      },
    ]);
  }

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
    const existingJob = this.jobs.find((job) => job.dedupeKey === input.dedupeKey);
    if (existingJob) {
      return existingJob;
    }

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
    this.updateJobStatus(jobId, "sent");
  }

  async markJobPending(jobId: number): Promise<void> {
    this.pendingJobIds.push(jobId);
    this.updateJobStatus(jobId, "pending");
  }

  async markJobFailed(jobId: number): Promise<void> {
    this.failedJobIds.push(jobId);
    this.updateJobStatus(jobId, "failed");
  }

  private updateJobStatus(jobId: number, status: NotificationJob["status"]): void {
    const job = this.jobs.find((item) => item.id === jobId);
    if (job) {
      job.status = status;
    }
  }

  private nextSubscriptionId(userId: number): number {
    const subscriptions = this.subscriptionsByUserId.get(userId) ?? [];
    return subscriptions.reduce((max, subscription) => Math.max(max, subscription.id), 0) + 1;
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

  async updateCompletion(): Promise<void> {}

  async findUserById(): Promise<null> {
    return null;
  }

  async findUserByEmail(): Promise<null> {
    return null;
  }

  async findUsersByEmails(): Promise<[]> {
    return [];
  }

  async recordEvent(): Promise<number> {
    return 1;
  }
}

class RecordingPushSender implements PushSender {
  sent: Array<{ subscription: PushSubscriptionRecord; payload: NotificationPayload }> = [];

  async send(subscription: PushSubscriptionRecord, payload: NotificationPayload): Promise<{ ok: true }> {
    this.sent.push({ subscription, payload });

    return { ok: true };
  }
}

function createTask(input: Pick<Task, "id" | "title" | "dueDate">): Task {
  return {
    id: input.id,
    title: input.title,
    description: null,
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

function createCompletedEvent(input: { eventId: number; taskId: number }): PersistedTaskDomainEvent {
  return {
    eventId: input.eventId,
    type: "TaskCompleted",
    taskId: input.taskId,
    actorUserId: 1,
    payload: {
      title: "トイレ掃除",
      fromAssigneeUserId: 1,
      toAssigneeUserId: 2,
      nextDueDate: "2026-07-11",
    },
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
