import type { Task } from '../types/task';
import type { User } from '../types/user';

export const currentUser: User = {
  id: '1',
  sub: 'sub-1',
  email: 'me@example.com',
  name: '自分',
  pictureUrl: 'https://example.com/me.png',
};

export function createTaskFixture(input: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    description: null,
    status: 'todo',
    dueDate: null,
    intervalDays: 1,
    assignee: null,
    assigneeUserId: null,
    assigneePictureUrl: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...input,
  };
}
