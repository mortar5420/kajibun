import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, test } from 'vitest';
import App from './App';
import { queryClient } from './lib/queryClient';
import { server } from './test/server';
import userEvent from '@testing-library/user-event';
import { currentUser } from './test/fixtures';

beforeEach(() => {
  queryClient.clear();
});

test('shows the login prompt when the current user is not authenticated', async () => {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Unauthorized',
          },
        },
        { status: 401 },
      ),
    ),
  );

  render(<App />);

  expect(await screen.findByRole('link', { name: 'Google でログイン' })).toHaveAttribute(
    'href',
    '/api/auth/login?return_to=http%3A%2F%2Flocalhost%3A3000',
  );
  expect(await screen.findByText('許可された Google アカウントでログインしてください。')).toBeInTheDocument();
});

test('opens monthly completion reports from the authenticated app navigation', async () => {
  const user = userEvent.setup();
  server.use(
    http.get('/api/me', () => HttpResponse.json({ user: currentUser })),
    http.get('/api/tasks', () => HttpResponse.json({ tasks: [] })),
    http.get('/api/completions', ({ request }) => HttpResponse.json({
      month: new URL(request.url).searchParams.get('month'),
      totals: { total: 0, normal: 0, overdueTakeover: 0, unknown: 0 },
      byUser: [], byTask: [], completions: [],
    })),
  );
  render(<App />);
  await user.click(await screen.findByRole('button', { name: '実施記録' }));
  expect(await screen.findByRole('heading', { name: '月ごとの実施記録' })).toBeInTheDocument();
  expect(await screen.findByText('この月の実施記録はありません。')).toBeInTheDocument();
  expect(screen.getByLabelText<HTMLInputElement>('集計月').value).toMatch(/^\d{4}-\d{2}$/);
});
