import { screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { TaskAdmin } from './TaskAdmin';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { createTaskFixture } from '../test/fixtures';

describe('TaskAdmin', () => {
  test('opens the add dialog and creates a task', async () => {
    const user = userEvent.setup();
    let tasks = [createTaskFixture({ id: '1', title: '風呂掃除', dueDate: '2026-07-10', intervalDays: 2 })];
    server.use(
      http.get('/api/tasks', () => HttpResponse.json({ tasks })),
      http.post('/api/tasks', async ({ request }) => {
        expect(await request.json()).toEqual({
          title: '洗濯',
          description: null,
          dueDate: null,
          intervalDays: 1,
        });

        const task = createTaskFixture({ id: '2', title: '洗濯' });
        tasks = [...tasks, task];

        return HttpResponse.json({ task });
      }),
    );

    renderWithProviders(<TaskAdmin />);

    expect(await screen.findByRole('heading', { name: '風呂掃除' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'かじを追加' }));
    const dialog = await screen.findByRole('dialog', { name: 'かじを追加' });
    await user.type(within(dialog).getByLabelText('名前'), '洗濯');
    await user.click(within(dialog).getByRole('button', { name: '追加' }));

    expect(await screen.findByRole('heading', { name: '洗濯' })).toBeInTheDocument();
    await waitForElementToBeRemoved(dialog);
  });

  test('opens the edit dialog with current values and updates a task', async () => {
    const user = userEvent.setup();
    let tasks = [
      createTaskFixture({
        id: '1',
        title: '風呂掃除',
        description: '浴槽',
        dueDate: '2026-07-10',
        intervalDays: 2,
      }),
    ];
    server.use(
      http.get('/api/tasks', () => HttpResponse.json({ tasks })),
      http.patch('/api/tasks/1', async ({ request }) => {
        expect(await request.json()).toEqual({
          title: '風呂掃除 updated',
          description: '浴槽',
          dueDate: '2026-07-10',
          intervalDays: 3,
        });

        const task = createTaskFixture({
          ...tasks[0],
          title: '風呂掃除 updated',
          intervalDays: 3,
        });
        tasks = [task];

        return HttpResponse.json({ task });
      }),
    );

    renderWithProviders(<TaskAdmin />);

    expect(await screen.findByRole('heading', { name: '風呂掃除' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '編集' }));
    const dialog = await screen.findByRole('dialog', { name: 'かじを編集' });
    const nameInput = within(dialog).getByLabelText('名前');
    const intervalInput = within(dialog).getByLabelText('日数');
    expect(nameInput).toHaveValue('風呂掃除');
    expect(intervalInput).toHaveValue(2);

    await user.type(nameInput, ' updated');
    await user.clear(intervalInput);
    await user.type(intervalInput, '3');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('heading', { name: '風呂掃除 updated' })).toBeInTheDocument();
  });
});
