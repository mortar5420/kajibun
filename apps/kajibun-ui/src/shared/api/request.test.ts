import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, apiUrl, request } from './request';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('shared api request', () => {
  test('builds API URLs from the configured base path', () => {
    expect(apiUrl('/tasks')).toBe('/api/tasks');
  });

  test('sends JSON content type and credentials for string bodies', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    globalThis.fetch = fetchMock;

    const result = await request<{ ok: boolean }>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: '風呂掃除' }),
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: '風呂掃除' }),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  test('throws ApiError with response error details', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: 'invalid_task',
            message: 'Task is invalid',
          },
        },
        { status: 400 },
      ),
    );

    await expect(request('/tasks')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Task is invalid',
      status: 400,
      code: 'invalid_task',
    } satisfies Partial<ApiError>);
  });
});
