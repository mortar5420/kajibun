import { Hono } from "hono";
import { createDb, requireCurrentUser } from "../app/context";
import type { AppHonoContext } from "../app/context";
import { getTodayDateString } from "../shared/date";
import { monthRange, summarizeCompletions } from "./domain";
import { createCompletionRepository } from "./repository";

export const completionsRoutes = new Hono<AppHonoContext>();

completionsRoutes.get("/", async (c) => {
  const db = createDb(c);
  await requireCurrentUser(c, db);
  const month = c.req.query("month") ?? getTodayDateString().slice(0, 7);
  const { start, end } = monthRange(month);
  const repository = createCompletionRepository(db);
  const [completions, users] = await Promise.all([repository.listInRange(start, end), repository.listUsers()]);
  return c.json({ month, ...summarizeCompletions(completions, users), completions });
});
