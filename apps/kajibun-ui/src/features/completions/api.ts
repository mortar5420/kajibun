import { request } from '../../shared/api/request';

export type CompletionCounts = { total: number; normal: number; overdueTakeover: number; unknown: number };
export type Completion = {
  id: string;
  taskId: string;
  title: string;
  performedByUserId: string | null;
  performedByName: string;
  performedAt: string;
  dueDate: string | null;
  classification: 'normal' | 'overdue_takeover' | 'unknown';
  takeoverFromUserId: string | null;
  takeoverFromName: string | null;
  takeoverAt: string | null;
  takeoverDueDate: string | null;
};
export type MonthlyCompletions = {
  month: string;
  totals: CompletionCounts;
  byUser: (CompletionCounts & { userId: string | null; name: string })[];
  byTask: (CompletionCounts & { taskId: string; title: string })[];
  completions: Completion[];
};

export function getMonthlyCompletions(month: string): Promise<MonthlyCompletions> {
  return request(`/completions?month=${encodeURIComponent(month)}`);
}
