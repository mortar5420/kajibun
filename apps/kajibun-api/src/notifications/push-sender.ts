import type { PushSendResult, PushSubscriptionRecord } from "./types";

export interface PushSender {
  send(subscription: PushSubscriptionRecord): Promise<PushSendResult>;
}
