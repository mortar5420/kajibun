import { Task } from '../types/task';
import dayjs from 'dayjs';

const today = dayjs().format('YYYY-MM-DD');

export const mockTasks: Task[] = [
  {
    id: '1',
    title: 'プロジェクト計画の作成',
    description: '次期プロジェクトの計画書を作成する',
    status: 'todo',
    dueDate: today,
    assignee: '山田太郎',
    createdAt: today,
    updatedAt: today,
  },
  {
    id: '2',
    title: 'クライアントミーティング',
    description: '新規機能についての要件定義',
    status: 'in_progress',
    dueDate: today,
    assignee: '鈴木花子',
    createdAt: today,
    updatedAt: today,
  },
  {
    id: '3',
    title: 'バグ修正',
    description: '認証機能のバグ修正',
    status: 'todo',
    dueDate: today,
    assignee: '田中次郎',
    createdAt: today,
    updatedAt: today,
  },
];

