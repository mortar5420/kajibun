import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Task } from '../types/task';
import type { User } from '../types/user';
import { getTasks, reassignTask, updateTaskStatus } from '../features/tasks/api';

interface TaskListProps {
  currentUser: User;
}

const getStatusColor = (status: Task['status']) => {
  switch (status) {
    case 'todo':
      return 'bg-slate-500';
    case 'done':
      return 'bg-green-600';
    default:
      return 'bg-slate-500';
  }
};

const getStatusLabel = (status: Task['status']) => {
  switch (status) {
    case 'todo':
      return '未着手';
    case 'done':
      return '完了';
    default:
      return '不明';
  }
};

export const TaskList = ({ currentUser }: TaskListProps) => {
  const queryClient = useQueryClient();
  const [showOnlyMine, setShowOnlyMine] = useState(false);
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
  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: Task['status'] }) => updateTaskStatus(taskId, status),
    onSuccess: (updatedTask) => {
      updateTaskCache(queryClient, updatedTask);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const currentUserId = String(currentUser.id);
  const filteredTasks = showOnlyMine ? tasks.filter((task) => task.assigneeUserId === currentUserId) : tasks;
  const isMutating = reassignMutation.isPending || statusMutation.isPending;

  if (isLoading) {
    return <StatusMessage>かじ一覧を読み込んでいます。</StatusMessage>;
  }

  if (isError) {
    return <StatusMessage>かじ一覧を取得できませんでした。{error instanceof Error ? ` ${error.message}` : ''}</StatusMessage>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showOnlyMine}
            onChange={(event) => setShowOnlyMine(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900"
          />
          自担当のみ表示する
        </label>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{task.title}</h2>
                  {task.description ? <p className="mt-2 text-sm text-slate-600">{task.description}</p> : null}
                </div>
                <span className={`${getStatusColor(task.status)} w-fit rounded-full px-3 py-1 text-sm text-white`}>
                  {getStatusLabel(task.status)}
                </span>
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
                <span>期限: {task.dueDate ?? '未設定'}</span>
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
                    onClick={() => statusMutation.mutate({ taskId: task.id, status: task.status === 'done' ? 'todo' : 'done' })}
                    disabled={isMutating}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
                  >
                    {task.status === 'done' ? '未着手に戻す' : '完了にする'}
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

function updateTaskCache(queryClient: ReturnType<typeof useQueryClient>, updatedTask: Task) {
  queryClient.setQueryData<Task[]>(['tasks'], (currentTasks) =>
    currentTasks?.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
  );
}
