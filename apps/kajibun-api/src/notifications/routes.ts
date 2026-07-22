import type { Hono } from "hono";
import { createWebPushSender } from "../adapters/push/web-push";
import { createDb, readJson, requireCurrentUser } from "../app/context";
import type { AppHonoContext } from "../app/context";
import { createSqlNotificationRepository } from "./repository";
import { getLatestNotificationUseCase, sendTestPushNotificationUseCase, subscribePushUseCase } from "./service";
import type { PushSubscriptionInput } from "./types";

export function registerNotificationRoutes(app: Hono<AppHonoContext>, prefix = ""): void {
  app.get(`${prefix}/push/vapid-public-key`, (c) =>
    c.json({
      publicKey: c.env.VAPID_PUBLIC_KEY ?? null,
    }),
  );

  app.post(`${prefix}/push-subscriptions`, async (c) => {
    const db = createDb(c);
    const actor = await requireCurrentUser(c, db);
    const repository = createSqlNotificationRepository(db);
    const input = await readJson<PushSubscriptionInput>(c);

    await subscribePushUseCase(repository, actor, input, c.req.header("user-agent") ?? null);

    return c.json({
      ok: true,
    });
  });

  app.get(`${prefix}/notifications/latest`, async (c) => {
    const db = createDb(c);
    const actor = await requireCurrentUser(c, db);
    const repository = createSqlNotificationRepository(db);
    const notification = await getLatestNotificationUseCase(repository, actor);

    return c.json({
      notification,
    });
  });

  app.post(`${prefix}/push/test`, async (c) => {
    const db = createDb(c);
    const actor = await requireCurrentUser(c, db);
    const repository = createSqlNotificationRepository(db);
    const pushSender = createWebPushSender({
      publicKey: c.env.VAPID_PUBLIC_KEY,
      privateKey: c.env.VAPID_PRIVATE_KEY,
      subject: c.env.VAPID_SUBJECT,
    });
    const status = await sendTestPushNotificationUseCase(repository, pushSender, actor);

    return c.json({
      ok: status === "sent",
      status,
    });
  });
}
