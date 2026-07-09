import type { NotificationPayload, PushSendResult, PushSubscriptionRecord } from "./types";

export interface PushSender {
  send(subscription: PushSubscriptionRecord, payload: NotificationPayload): Promise<PushSendResult>;
}
