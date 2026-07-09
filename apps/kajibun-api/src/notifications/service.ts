import type { CurrentUser } from "../auth/types";
import { parseAllowedEmails } from "../auth/policy";
import { getTodayDateString } from "../shared/date";
import type { TaskDomainEvent } from "../tasks/events";
import type { TaskRepository } from "../tasks/repository";
import type { NotificationJob, NotificationPayload, PushSubscriptionInput } from "./types";
import type { NotificationRepository } from "./repository";
import type { PushSender } from "./push-sender";
import { parsePushSubscriptionInput } from "./validation";

const MAX_SEND_ATTEMPTS = 3;
type TaskCompletedEvent = TaskDomainEvent & { type: "TaskCompleted" };

export async function subscribePushUseCase(
  repository: NotificationRepository,
  actor: CurrentUser,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const subscription = parsePushSubscriptionInput(input);
  await repository.upsertSubscription({
    userId: actor.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    userAgent,
  });
}

export async function handleTaskNotificationEvent(
  event: TaskDomainEvent,
  options: {
    notificationRepository: NotificationRepository;
    pushSender: PushSender;
  },
): Promise<void> {
  if (event.type !== "TaskCompleted") {
    return;
  }

  await enqueueAndSendTaskCompletedNotifications({ ...event, type: "TaskCompleted" }, options);
}

export async function sendPendingNotificationsUseCase(
  repository: NotificationRepository,
  pushSender: PushSender,
  limit = 20,
): Promise<{ sent: number; failed: number; pending: number }> {
  const jobs = await repository.listPendingJobs(limit);
  const result = {
    sent: 0,
    failed: 0,
    pending: 0,
  };

  for (const job of jobs) {
    const status = await sendNotificationJob(repository, pushSender, job);
    result[status] += 1;
  }

  return result;
}

export async function sendDueTodayNotificationsUseCase(
  taskRepository: TaskRepository,
  notificationRepository: NotificationRepository,
  pushSender: PushSender,
  allowedEmailsConfig?: string,
  today = getTodayDateString(),
): Promise<{ sent: number; failed: number; pending: number }> {
  const tasks = await taskRepository.list();
  const recipientEmails = Array.from(parseAllowedEmails(allowedEmailsConfig));
  const recipients = await notificationRepository.findUsersByEmails(recipientEmails);
  const result = {
    sent: 0,
    failed: 0,
    pending: 0,
  };

  for (const task of tasks) {
    if (task.status !== "todo" || task.dueDate !== today) {
      continue;
    }

    const taskRecipients =
      task.assigneeUserId === null ? recipients : recipients.filter((recipient) => recipient.id === task.assigneeUserId);
    const payload: NotificationPayload = {
      title: "今日が期限の家事があります",
      body: task.title,
      url: "/",
    };

    for (const recipient of taskRecipients) {
      const job = await notificationRepository.createJob({
        type: "task_due_today",
        recipientUserId: recipient.id,
        taskId: task.id,
        dedupeKey: ["task_due_today", today, task.id, recipient.id].join(":"),
        payload,
      });

      if (job.status !== "pending") {
        continue;
      }

      const status = await sendNotificationJob(notificationRepository, pushSender, job);
      result[status] += 1;
    }
  }

  return result;
}

export async function sendTestPushNotificationUseCase(
  repository: NotificationRepository,
  pushSender: PushSender,
  actor: CurrentUser,
): Promise<"sent" | "failed" | "pending"> {
  const now = new Date().toISOString();
  const job = await repository.createJob({
    type: "test_push",
    recipientUserId: actor.id,
    taskId: null,
    dedupeKey: ["test_push", actor.id, now].join(":"),
    payload: {
      title: "kajibun テスト通知",
      body: "通知の即時送信テストです。",
      url: "/",
    },
  });

  return sendNotificationJob(repository, pushSender, job);
}

async function enqueueAndSendTaskCompletedNotifications(
  event: TaskCompletedEvent,
  options: {
    notificationRepository: NotificationRepository;
    pushSender: PushSender;
  },
): Promise<void> {
  const recipients = await options.notificationRepository.listUsersWithActiveSubscriptionsExcept(event.actorUserId);
  const payload: NotificationPayload = {
    title: "家事が完了しました",
    body: "担当の家事が完了しました。",
    url: "/",
  };

  for (const recipient of recipients) {
    if (recipient.id === event.actorUserId) {
      continue;
    }

    const job = await options.notificationRepository.createJob({
      type: "task_completed",
      recipientUserId: recipient.id,
      taskId: event.taskId,
      dedupeKey: [
        "task_completed",
        event.taskId,
        recipient.id,
        event.payload.fromStatus,
        event.payload.toStatus,
        event.payload.nextDueDate ?? "none",
      ].join(":"),
      payload,
    });

    if (job.status !== "pending") {
      continue;
    }

    await sendNotificationJob(options.notificationRepository, options.pushSender, job);
  }
}

async function sendNotificationJob(
  repository: NotificationRepository,
  pushSender: PushSender,
  job: NotificationJob,
): Promise<"sent" | "failed" | "pending"> {
  const subscriptions = await repository.listActiveSubscriptionsByUserId(job.recipientUserId);
  if (subscriptions.length === 0) {
    await repository.markJobFailed(job.id, "no_active_push_subscription");
    return "failed";
  }

  let hasRetryableError = false;
  let lastError = "push_send_failed";

  for (const subscription of subscriptions) {
    const result = await pushSender.send(subscription);
    if (result.ok) {
      await repository.markJobSent(job.id);
      return "sent";
    }

    lastError = result.error;
    hasRetryableError = hasRetryableError || result.retryable;
    if (result.revokeSubscription) {
      await repository.revokeSubscription(subscription.id);
    }
  }

  if (hasRetryableError && job.attempts + 1 < MAX_SEND_ATTEMPTS) {
    await repository.markJobPending(job.id, lastError);
    return "pending";
  }

  await repository.markJobFailed(job.id, lastError);
  return "failed";
}
