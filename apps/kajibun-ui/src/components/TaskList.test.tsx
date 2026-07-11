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

  test('assigns a task to the current user and then marks it done', async () => {
    const user = userEvent.setup();
    const initialTask = createTaskFixture({ id: '1', title: '未担当のかじ' });
    const assignedTask = {
      ...initialTask,
      assignee: '自分',
      assigneeUserId: currentUser.id,
      assigneePictureUrl: currentUser.pictureUrl ?? null,
    };
    let tasks = [initialTask];
    server.use(
      http.get('/api/tasks', () => HttpResponse.json({ tasks })),
      http.patch('/api/tasks/1/assignee', async ({ request }) => {
        expect(await request.json()).toEqual({ assigneeUserId: currentUser.id });
        tasks = [assignedTask];
        return HttpResponse.json({ task: assignedTask });
      }),
      http.patch('/api/tasks/1/complete', async ({ request }) => {
        expect(await request.json()).toEqual({ status: 'done' });
        const task = createTaskFixture({ ...assignedTask, status: 'done' });
        tasks = [task];
        return HttpResponse.json({ task });
      }),
    );

    renderWithProviders(<TaskList currentUser={currentUser} />);

    expect(await screen.findByRole('heading', { name: '未担当のかじ' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '自分が担当する' }));

    expect(await screen.findByText('自分')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '完了にする' }));

    expect(await screen.findByText('完了')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '未着手に戻す' })).toBeInTheDocument();
  });
});
