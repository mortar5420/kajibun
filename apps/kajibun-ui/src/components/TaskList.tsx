import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Task } from '../types/task';
import type { User } from '../types/user';
import { completeTask, getTasks, reassignTask } from '../features/tasks/api';

interface TaskListProps {
  currentUser: User;
}

export const TaskList = ({ currentUser }: TaskListProps) => {
  const queryClient = useQueryClient();
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [showDueTodayOnly, setShowDueTodayOnly] = useState(false);
  const [crackerKey, setCrackerKey] = useState(0);
  const {
    data: tasks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['tasks'],
    queryFn: getTasks,
  });
  const reassignMutation = useMutation({
    mutationFn: ({ taskId, assigneeUserId }: { taskId: string; assigneeUserId: string | null }) =>
      reassignTask(taskId, assigneeUserId),
    onSuccess: (updatedTask) => {
      updateTaskCache(queryClient, updatedTask);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const completeMutation = useMutation({
    mutationFn: ({ taskId }: { taskId: string }) => completeTask(taskId),
    onSuccess: (updatedTask) => {
      updateTaskCache(queryClient, updatedTask);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setCrackerKey((current) => current + 1);
    },
  });

  const currentUserId = String(currentUser.id);
  const today = getTodayDateString();
  const filteredTasks = tasks.filter((task) => {
    if (showOnlyMine && task.assigneeUserId !== currentUserId) {
      return false;
    }

    if (showDueTodayOnly && task.dueDate !== today) {
      return false;
    }

    return true;
  });
  const isMutating = reassignMutation.isPending || completeMutation.isPending;

  if (isLoading) {
    return <StatusMessage>かじ一覧を読み込んでいます。</StatusMessage>;
  }

  if (isError) {
    return <StatusMessage>かじ一覧を取得できませんでした。{error instanceof Error ? ` ${error.message}` : ''}</StatusMessage>;
  }

  return (
    <section className="space-y-4">
      {crackerKey > 0 ? <Cracker key={crackerKey} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showOnlyMine}
              onChange={(event) => setShowOnlyMine(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            自担当のみ表示する
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showDueTodayOnly}
              onChange={(event) => setShowDueTodayOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            当日期限のみ表示する
          </label>
        </div>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['tasks'] })}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
        >
          更新
        </button>
      </div>

      {filteredTasks.length === 0 ? <StatusMessage>表示するかじがありません。</StatusMessage> : null}

      <div className="grid gap-4">
        {filteredTasks.map((task) => {
          const isAssignedToMe = task.assigneeUserId === currentUserId;

          return (
            <article key={task.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{task.title}</h2>
                  {task.description ? <p className="mt-2 text-sm text-slate-600">{task.description}</p> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <span className="flex items-center gap-2">
                  担当:
                  {task.assignee ? (
                    <>
                      <AssigneeAvatar name={task.assignee} pictureUrl={task.assigneePictureUrl} />
                      <span>{task.assignee}</span>
                    </>
                  ) : (
                    <span>未設定</span>
                  )}
                </span>
                <span className={task.dueDate === today ? 'font-semibold text-orange-600' : undefined}>
                  期限: {formatDueDate(task.dueDate)}
                </span>
                <span>日数: {task.intervalDays}</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!isAssignedToMe ? (
                  <button
                    type="button"
                    onClick={() =>
                      reassignMutation.mutate({
                        taskId: task.id,
                        assigneeUserId: currentUserId,
                      })
                    }
                    disabled={isMutating}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-60"
                  >
                    自分が担当する
                  </button>
                ) : null}
                {isAssignedToMe ? (
                  <button
                    type="button"
                    onClick={() => completeMutation.mutate({ taskId: task.id })}
                    disabled={isMutating}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
                  >
                    終わった
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

function StatusMessage({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">{children}</div>;
}

function AssigneeAvatar({ name, pictureUrl }: { name: string; pictureUrl: string | null }) {
  if (pictureUrl) {
    return <img src={pictureUrl} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />;
  }

  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Cracker() {
  const pieces = Array.from({ length: 28 }, (_, index) => {
    const angle = -82 + index * 6;
    const distance = 96 + (index % 5) * 16;
    const delay = (index % 7) * 22;
    const color = ['#f97316', '#facc15', '#22c55e', '#38bdf8', '#f472b6', '#a78bfa', '#ef4444'][index % 7];

    return (
      <span
        key={index}
        className="cracker-piece"
        style={
          {
            '--angle': `${angle}deg`,
            '--distance': `${distance}px`,
            '--delay': `${delay}ms`,
            '--color': color,
          } as CSSProperties
        }
      />
    );
  });

  return (
    <div className="cracker-burst pointer-events-none fixed inset-x-0 top-24 z-50 mx-auto h-40 w-64" aria-hidden="true">
      <div className="cracker-origin left-16">{pieces.slice(0, 14)}</div>
      <div className="cracker-origin right-16">{pieces.slice(14)}</div>
    </div>
  );
}

function updateTaskCache(queryClient: ReturnType<typeof useQueryClient>, updatedTask: Task) {
  queryClient.setQueryData<Task[]>(['tasks'], (currentTasks) =>
    currentTasks?.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
  );
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) {
    return '未設定';
  }

  const date = parseDateString(dueDate);
  return `${dueDate}（${['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}）`;
}

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}
