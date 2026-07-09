import type { SqlClient } from "../db/client";
import type {
  NotificationJob,
  NotificationJobType,
  NotificationPayload,
  NotificationRecipient,
  PushSubscriptionRecord,
} from "./types";

type PushSubscriptionRow = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
};

type NotificationJobRow = {
  id: number;
  type: NotificationJobType;
  recipient_user_id: number;
  task_id: number | null;
  dedupe_key: string;
  payload_json: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
};

export interface NotificationRepository {
  upsertSubscription(input: {
    userId: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
  }): Promise<void>;
  findUsersByEmails(emails: string[]): Promise<NotificationRecipient[]>;
  listActiveSubscriptionsByUserId(userId: number): Promise<PushSubscriptionRecord[]>;
  revokeSubscription(subscriptionId: number): Promise<void>;
  createJob(input: {
    type: NotificationJobType;
    recipientUserId: number;
    taskId: number | null;
    dedupeKey: string;
    payload: NotificationPayload;
  }): Promise<NotificationJob>;
  listPendingJobs(limit: number): Promise<NotificationJob[]>;
  markJobSent(jobId: number): Promise<void>;
  markJobPending(jobId: number, error: string): Promise<void>;
  markJobFailed(jobId: number, error: string): Promise<void>;
}

export function createSqlNotificationRepository(db: SqlClient): NotificationRepository {
  return {
    async upsertSubscription(input): Promise<void> {
      await db.run(
        `
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at, revoked_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
        ON CONFLICT(endpoint) DO UPDATE SET
          user_id = excluded.user_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          user_agent = excluded.user_agent,
          updated_at = datetime('now'),
          revoked_at = NULL
        `,
        [input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent],
      );
    },

    async findUsersByEmails(emails: string[]): Promise<NotificationRecipient[]> {
      const normalizedEmails = emails.map((email) => email.toLowerCase());
      if (normalizedEmails.length === 0) {
        return [];
      }

      const placeholders = normalizedEmails.map(() => "?").join(", ");
      return db.all<NotificationRecipient>(
        `
        SELECT id, email
        FROM users
        WHERE lower(email) IN (${placeholders})
        `,
        normalizedEmails,
      );
    },

    async listActiveSubscriptionsByUserId(userId: number): Promise<PushSubscriptionRecord[]> {
      const rows = await db.all<PushSubscriptionRow>(
        `
        SELECT id, user_id, endpoint, p256dh, auth, user_agent
        FROM push_subscriptions
        WHERE user_id = ? AND revoked_at IS NULL
        ORDER BY id ASC
        `,
        [userId],
      );

      return rows.map(toPushSubscriptionRecord);
    },

    async revokeSubscription(subscriptionId: number): Promise<void> {
      await db.run(
        `
        UPDATE push_subscriptions
        SET revoked_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
        `,
        [subscriptionId],
      );
    },

    async createJob(input): Promise<NotificationJob> {
      await db.run(
        `
        INSERT INTO notification_jobs (
          type,
          recipient_user_id,
          task_id,
          dedupe_key,
          payload_json,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
        ON CONFLICT(dedupe_key) DO NOTHING
        `,
        [input.type, input.recipientUserId, input.taskId, input.dedupeKey, JSON.stringify(input.payload)],
      );

      const job = await db.first<NotificationJobRow>(
        `
        SELECT id, type, recipient_user_id, task_id, dedupe_key, payload_json, status, attempts
        FROM notification_jobs
        WHERE dedupe_key = ?
        `,
        [input.dedupeKey],
      );

      if (!job) {
        throw new Error("Failed to create notification job");
      }

      return toNotificationJob(job);
    },

    async listPendingJobs(limit: number): Promise<NotificationJob[]> {
      const rows = await db.all<NotificationJobRow>(
        `
        SELECT id, type, recipient_user_id, task_id, dedupe_key, payload_json, status, attempts
        FROM notification_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC, id ASC
        LIMIT ?
        `,
        [limit],
      );

      return rows.map(toNotificationJob);
    },

    async markJobSent(jobId: number): Promise<void> {
      await db.run(
        `
        UPDATE notification_jobs
        SET status = 'sent', attempts = attempts + 1, sent_at = datetime('now'), updated_at = datetime('now'), last_error = NULL
        WHERE id = ?
        `,
        [jobId],
      );
    },

    async markJobPending(jobId: number, error: string): Promise<void> {
      await db.run(
        `
        UPDATE notification_jobs
        SET status = 'pending', attempts = attempts + 1, updated_at = datetime('now'), last_error = ?
        WHERE id = ?
        `,
        [error, jobId],
      );
    },

    async markJobFailed(jobId: number, error: string): Promise<void> {
      await db.run(
        `
        UPDATE notification_jobs
        SET status = 'failed', attempts = attempts + 1, updated_at = datetime('now'), last_error = ?
        WHERE id = ?
        `,
        [error, jobId],
      );
    },
  };
}

function toPushSubscriptionRecord(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent,
  };
}

function toNotificationJob(row: NotificationJobRow): NotificationJob {
  return {
    id: row.id,
    type: row.type,
    recipientUserId: row.recipient_user_id,
    taskId: row.task_id,
    dedupeKey: row.dedupe_key,
    payload: JSON.parse(row.payload_json) as NotificationPayload,
    status: row.status,
    attempts: row.attempts,
  };
}
