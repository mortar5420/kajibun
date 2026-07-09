export type PushSubscriptionInput = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

export type PushSubscriptionRecord = {
  id: number;
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

export type NotificationJobStatus = "pending" | "sent" | "failed";

export type NotificationJobType = "task_completed" | "task_due_today" | "test_push";

export type NotificationJob = {
  id: number;
  type: NotificationJobType;
  recipientUserId: number;
  taskId: number | null;
  dedupeKey: string;
  payload: NotificationPayload;
  status: NotificationJobStatus;
  attempts: number;
};

export type NotificationPayload = {
  title: string;
  body: string;
  url: string;
};

export type NotificationRecipient = {
  id: number;
  email: string;
};

export type PushSendResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      retryable: boolean;
      revokeSubscription: boolean;
      error: string;
    };
