import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { TaskList } from './TaskList';
import { currentUser, createTaskFixture } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';

describe('TaskList', () => {
  test('filters tasks to the current user assignments', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/tasks', () =>
        HttpResponse.json({
          tasks: [
            createTaskFixture({
              id: '1',
              title: '自分のかじ',
              assignee: '自分',
              assigneeUserId: currentUser.id,
              assigneePictureUrl: currentUser.pictureUrl ?? null,
            }),
            createTaskFixture({
              id: '2',
              title: '相手のかじ',
              assignee: '相手',
              assigneeUserId: '2',
            }),
          ],
        }),
      ),
    );

    renderWithProviders(<TaskList currentUser={currentUser} />);

    expect(await screen.findByRole('heading', { name: '自分のかじ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '相手のかじ' })).toBeInTheDocument();

    await user.click(screen.getByLabelText('自担当のみ表示する'));

    expect(screen.getByRole('heading', { name: '自分のかじ' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '相手のかじ' })).not.toBeInTheDocument();
  });

  test('shows weekday, highlights tasks due today, and filters to due-today tasks', async () => {
    const user = userEvent.setup();
    const today = formatDateString(new Date());
    const tomorrow = addDays(today, 1);
    server.use(
      http.get('/api/tasks', () =>
        HttpResponse.json({
          tasks: [
            createTaskFixture({
              id: '1',
              title: '今日のかじ',
              dueDate: today,
            }),
            createTaskFixture({
              id: '2',
              title: '明日のかじ',
              dueDate: tomorrow,
            }),
            createTaskFixture({
              id: '3',
              title: '期限なしのかじ',
              dueDate: null,
            }),
          ],
        }),
      ),
    );

    renderWithProviders(<TaskList currentUser={currentUser} />);

    const dueToday = await screen.findByText(`期限: ${formatDueDate(today)}`);
    expect(dueToday).toHaveClass('text-orange-600');
    expect(screen.getByText(`期限: ${formatDueDate(tomorrow)}`)).not.toHaveClass('text-orange-600');
    expect(screen.getByText('期限: 未設定')).not.toHaveClass('text-orange-600');

    await user.click(screen.getByLabelText('当日期限のみ表示する'));

    expect(screen.getByRole('heading', { name: '今日のかじ' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '明日のかじ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '期限なしのかじ' })).not.toBeInTheDocument();
  });

  test('assigns a task to the current user and then hands it to the other user when completed', async () => {
    const user = userEvent.setup();
    const initialTask = createTaskFixture({ id: '1', title: '未担当のかじ' });
    const assignedTask = {
      ...initialTask,
      assignee: '自分',
      assigneeUserId: currentUser.id,
      assigneePictureUrl: currentUser.pictureUrl ?? null,
    };
    const completedTask = {
      ...assignedTask,
      assignee: '相手',
      assigneeUserId: '2',
      assigneePictureUrl: null,
    };
    let tasks = [initialTask];
    server.use(
      http.get('/api/tasks', () => HttpResponse.json({ tasks })),
      http.patch('/api/tasks/1/assignee', async ({ request }) => {
        expect(await request.json()).toEqual({ assigneeUserId: currentUser.id });
        tasks = [assignedTask];
        return HttpResponse.json({ task: assignedTask });
      }),
      http.patch('/api/tasks/1/complete', async () => {
        tasks = [completedTask];
        return HttpResponse.json({ task: completedTask });
      }),
    );

    renderWithProviders(<TaskList currentUser={currentUser} />);

    expect(await screen.findByRole('heading', { name: '未担当のかじ' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '自分が担当する' }));

    expect(await screen.findByText('自分')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '終わった' }));

    expect(await screen.findByText('相手')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '終わった' })).not.toBeInTheDocument();
  });
});

function formatDueDate(dateString: string): string {
  const date = parseDateString(dateString);
  return `${dateString}（${['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}）`;
}

function addDays(dateString: string, days: number): string {
  const date = parseDateString(dateString);
  date.setDate(date.getDate() + days);

  return formatDateString(date);
}

function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}
