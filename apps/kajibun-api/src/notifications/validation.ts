import { httpError } from "../shared/errors";
import type { PushSubscriptionInput } from "./types";

export function parsePushSubscriptionInput(input: PushSubscriptionInput): {
  endpoint: string;
  p256dh: string;
  auth: string;
} {
  if (typeof input.endpoint !== "string" || input.endpoint.length === 0) {
    throw httpError("invalid_push_subscription", "Push subscription endpoint is required", 400);
  }

  if (typeof input.keys?.p256dh !== "string" || input.keys.p256dh.length === 0) {
    throw httpError("invalid_push_subscription", "Push subscription p256dh key is required", 400);
  }

  if (typeof input.keys?.auth !== "string" || input.keys.auth.length === 0) {
    throw httpError("invalid_push_subscription", "Push subscription auth key is required", 400);
  }

  return {
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  };
}
