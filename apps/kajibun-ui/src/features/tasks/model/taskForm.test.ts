import { describe, expect, test } from 'vitest';
import { emptyTaskFormState, normalizeTaskForm, taskToFormState } from './taskForm';
import type { Task } from '../../../types/task';

describe('task form model', () => {
  test('normalizes trimmed form values into task input', () => {
    expect(
      normalizeTaskForm({
        title: '  風呂掃除  ',
        description: '  浴槽  ',
        dueDate: '  2026-07-10  ',
        intervalDaysText: '3',
      }),
    ).toEqual({
      title: '風呂掃除',
      description: '浴槽',
      dueDate: '2026-07-10',
      intervalDays: 3,
    });
  });

  test('normalizes blank optional values and falls back to the default interval', () => {
    expect(
      normalizeTaskForm({
        ...emptyTaskFormState,
        title: 'ゴミ出し',
        description: '  ',
        dueDate: '',
        intervalDaysText: '',
      }),
    ).toEqual({
      title: 'ゴミ出し',
      description: null,
      dueDate: null,
      intervalDays: 1,
    });
  });

  test('creates form state from a task', () => {
    expect(
      taskToFormState({
        id: '1',
        title: '洗濯',
        description: null,
        status: 'todo',
        dueDate: null,
        intervalDays: 2,
        assignee: null,
        assigneeUserId: null,
        assigneePictureUrl: null,
        createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T00:00:00.000Z',
      } satisfies Task),
    ).toEqual({
      title: '洗濯',
      description: '',
      dueDate: '',
      intervalDaysText: '2',
    });
  });
});
