import { Modal } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Task } from '../types/task';
import { createTask, deleteTask, getTasks, updateTask } from '../lib/api';
import type { TaskInput } from '../lib/api';

const emptyForm: TaskInput = {
  title: '',
  description: '',
  dueDate: '',
  intervalDays: 1,
};

type TaskFormState = Omit<TaskInput, 'intervalDays'> & {
  intervalDaysText: string;
};

const emptyFormState: TaskFormState = {
  title: '',
  description: '',
  dueDate: '',
  intervalDaysText: '1',
};

export function TaskAdmin() {
  const queryClient = useQueryClient();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState>(emptyFormState);
  const {
    data: tasks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['tasks'],
    queryFn: getTasks,
  });
  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: (createdTask) => {
      closeDialog();
      queryClient.setQueryData<Task[]>(['tasks'], (currentTasks) => [...(currentTasks ?? []), createdTask]);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: TaskInput }) => updateTask(taskId, input),
    onSuccess: (updatedTask) => {
      closeDialog();
      queryClient.setQueryData<Task[]>(['tasks'], (currentTasks) =>
        currentTasks?.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: (_, deletedTaskId) => {
      if (editingTaskId) {
        closeDialog();
      }
      queryClient.setQueryData<Task[]>(['tasks'], (currentTasks) =>
        currentTasks?.filter((task) => task.id !== deletedTaskId),
      );
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startCreate() {
    setEditingTaskId(null);
    setForm(emptyFormState);
    setIsDialogOpen(true);
  }

  function startEdit(task: Task) {
    setEditingTaskId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? '',
      dueDate: task.dueDate ?? '',
      intervalDaysText: String(task.intervalDays),
    });
    setIsDialogOpen(true);
  }

  function closeDialog() {
    setEditingTaskId(null);
    setForm(emptyFormState);
    setIsDialogOpen(false);
    createMutation.reset();
    updateMutation.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = normalizeForm(form);
    if (editingTaskId) {
      updateMutation.mutate({ taskId: editingTaskId, input });
      return;
    }

    createMutation.mutate(input);
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">かじ一覧</h2>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"
        >
          かじを追加
        </button>
      </div>

      <Modal opened={isDialogOpen} onClose={closeDialog} title={editingTaskId ? 'かじを編集' : 'かじを追加'} centered>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              名前
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                required
                className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal text-slate-900"
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              説明
              <textarea
                value={form.description ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal text-slate-900"
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              期限
              <input
                type="date"
                value={form.dueDate ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal text-slate-900"
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              日数
              <input
                type="number"
                min={1}
                step={1}
                value={form.intervalDaysText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    intervalDaysText: event.target.value,
                  }))
                }
                required
                className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal text-slate-900"
              />
            </label>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
            >
              {editingTaskId ? '保存' : '追加'}
            </button>
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
            >
              キャンセル
            </button>
          </div>

          {createMutation.isError || updateMutation.isError ? (
            <p className="mt-3 text-sm text-red-600">保存できませんでした。</p>
          ) : null}
        </form>
      </Modal>

      {isLoading ? <StatusMessage>かじ一覧を読み込んでいます。</StatusMessage> : null}
      {isError ? <StatusMessage>かじ一覧を取得できませんでした。{error instanceof Error ? ` ${error.message}` : ''}</StatusMessage> : null}

      <div className="grid gap-3">
        {tasks.map((task) => (
          <article key={task.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{task.title}</h3>
                {task.description ? <p className="mt-1 text-sm text-slate-600">{task.description}</p> : null}
                <p className="mt-2 text-sm text-slate-500">期限: {task.dueDate ?? '未設定'}</p>
                <p className="mt-1 text-sm text-slate-500">日数: {task.intervalDays}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(task)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`「${task.title}」を削除しますか？`)) {
                      deleteMutation.mutate(task.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm disabled:opacity-60"
                >
                  削除
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function normalizeForm(form: TaskFormState): TaskInput {
  const intervalDays = Number(form.intervalDaysText);

  return {
    title: form.title.trim(),
    description: form.description?.trim() ? form.description.trim() : null,
    dueDate: form.dueDate?.trim() ? form.dueDate.trim() : null,
    intervalDays: Number.isFinite(intervalDays) && intervalDays > 0 ? intervalDays : emptyForm.intervalDays,
  };
}

function StatusMessage({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">{children}</div>;
}
