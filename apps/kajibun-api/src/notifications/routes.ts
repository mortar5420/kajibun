import { createWebPushSender } from "../adapters/push/web-push";
import { createD1Client } from "../adapters/persistence/d1";
import type { Env } from "../app/env";
import { getCurrentUserOrResponse } from "../auth/http";
import { readJsonBody } from "../shared/errors";
import { createSqlNotificationRepository } from "./repository";
import { getLatestNotificationUseCase, sendTestPushNotificationUseCase, subscribePushUseCase } from "./service";
import type { PushSubscriptionInput } from "./types";

export function handleGetVapidPublicKey(env: Env): Response {
  return Response.json({
    publicKey: env.VAPID_PUBLIC_KEY ?? null,
  });
}

export async function handleSubscribePush(request: Request, env: Env): Promise<Response> {
  const db = createD1Client(env.DB);
  const actor = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (actor instanceof Response) {
    return actor;
  }

  const repository = createSqlNotificationRepository(db);
  const input = await readJsonBody<PushSubscriptionInput>(request);
  await subscribePushUseCase(repository, actor, input, request.headers.get("user-agent"));

  return Response.json({
    ok: true,
  });
}

export async function handleGetLatestNotification(request: Request, env: Env): Promise<Response> {
  const db = createD1Client(env.DB);
  const actor = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (actor instanceof Response) {
    return actor;
  }

  const repository = createSqlNotificationRepository(db);
  const notification = await getLatestNotificationUseCase(repository, actor);

  return Response.json({
    notification,
  });
}

export async function handleSendTestPush(request: Request, env: Env): Promise<Response> {
  const db = createD1Client(env.DB);
  const actor = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (actor instanceof Response) {
    return actor;
  }

  const repository = createSqlNotificationRepository(db);
  const pushSender = createWebPushSender({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  });
  const status = await sendTestPushNotificationUseCase(repository, pushSender, actor);

  return Response.json({
    ok: status === "sent",
    status,
  });
}
