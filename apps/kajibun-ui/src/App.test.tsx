import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, test } from 'vitest';
import App from './App';
import { queryClient } from './lib/queryClient';
import { server } from './test/server';

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
