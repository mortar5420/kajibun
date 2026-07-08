import { httpError } from "../shared/errors";
import type { TaskInput } from "./types";

export function parseTaskInput(body: TaskInput, options: { partial: boolean }): {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  intervalDays?: number;
} {
  const result: {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    intervalDays?: number;
  } = {};

  if (!options.partial || body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      throw httpError("invalid_task_title", "Task title is required", 400);
    }

    result.title = body.title.trim();
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      throw httpError("invalid_task_description", "Task description must be a string or null", 400);
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";
    result.description = description.length > 0 ? description : null;
  } else if (!options.partial) {
    result.description = null;
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate !== null && typeof body.dueDate !== "string") {
      throw httpError("invalid_task_due_date", "Task dueDate must be YYYY-MM-DD or null", 400);
    }

    const dueDate = typeof body.dueDate === "string" ? body.dueDate.trim() : "";
    if (dueDate.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw httpError("invalid_task_due_date", "Task dueDate must be YYYY-MM-DD or null", 400);
    }

    result.dueDate = dueDate.length > 0 ? dueDate : null;
  } else if (!options.partial) {
    result.dueDate = null;
  }

  if (body.intervalDays !== undefined) {
    if (typeof body.intervalDays === "number" && Number.isInteger(body.intervalDays) && body.intervalDays > 0) {
      result.intervalDays = body.intervalDays;
    } else if (
      typeof body.intervalDays === "string" &&
      /^\d+$/.test(body.intervalDays) &&
      Number.parseInt(body.intervalDays, 10) > 0
    ) {
      result.intervalDays = Number.parseInt(body.intervalDays, 10);
    } else {
      throw httpError("invalid_task_interval_days", "Task intervalDays must be a positive integer", 400);
    }
  } else if (!options.partial) {
    throw httpError("invalid_task_interval_days", "Task intervalDays is required", 400);
  }

  return result;
}
