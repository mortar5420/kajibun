import { Task } from '../types/task';
import dayjs from 'dayjs';

const today = dayjs().format('YYYY-MM-DD');

export const mockTasks: Task[] = [
  {
    id: '1',
    title: 'お皿洗い',
    description: 'お皿洗い',
    status: 'todo',
    dueDate: today,
    intervalDays: 1,
    assignee: 'チャス',
    assigneeUserId: '1',
    assigneePictureUrl: null,
    createdAt: today,
    updatedAt: today,
  },
  {
    id: '2',
    title: '普通洗濯',
    description: '普通洗濯',
    status: 'done',
    dueDate: today,
    intervalDays: 2,
    assignee: 'りちゃ',
    assigneeUserId: '2',
    assigneePictureUrl: null,
    createdAt: today,
    updatedAt: today,
  },
  {
    id: '3',
    title: 'おしゃれ着洗濯',
    description: 'おしゃれ着洗濯',
    status: 'todo',
    dueDate: today,
    intervalDays: 7,
    assignee: 'チャス',
    assigneeUserId: '1',
    assigneePictureUrl: null,
    createdAt: today,
    updatedAt: today,
  },
];
