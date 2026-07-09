import { createWebPushSender } from "../adapters/push/web-push";
import { createD1Client } from "../adapters/persistence/d1";
import { createSqlNotificationRepository } from "../notifications/repository";
import { sendDueTodayNotificationsUseCase, sendPendingNotificationsUseCase } from "../notifications/service";
import { createSqlTaskRepository } from "../tasks/repository";
import type { Env } from "./env";

export async function handleScheduled(env: Env): Promise<void> {
  const db = createD1Client(env.DB);
  const notificationRepository = createSqlNotificationRepository(db);
  const taskRepository = createSqlTaskRepository(db);
  const pushSender = createWebPushSender({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  });

  const dueTodayResult = await sendDueTodayNotificationsUseCase(
    taskRepository,
    notificationRepository,
    pushSender,
    env.ALLOWED_GOOGLE_EMAILS,
    getDueTodayNotificationSlot(),
  );
  const retryResult = await sendPendingNotificationsUseCase(notificationRepository, pushSender);
  console.log("notification scheduled run finished", {
    dueToday: dueTodayResult,
    retry: retryResult,
  });
}

function getDueTodayNotificationSlot(date = new Date()): string {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(date);

  return `${hour}:00`;
}
