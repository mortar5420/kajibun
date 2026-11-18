import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { server } from '../../../test/server';
import { MonthlyCompletions } from './MonthlyCompletions';
import type { MonthlyCompletions as MonthlyData } from '../api';

function report(month: string): MonthlyData {
  return {
    month,
    totals: { total: 3, normal: 1, overdueTakeover: 1, unknown: 1 },
    byUser: [
      { userId: '1', name: 'Aさん', total: 1, normal: 1, overdueTakeover: 0, unknown: 0 },
      { userId: '2', name: 'Bさん', total: 2, normal: 0, overdueTakeover: 1, unknown: 1 },
    ],
    byTask: [{ taskId: '10', title: '風呂掃除', total: 3, normal: 1, overdueTakeover: 1, unknown: 1 }],
    completions: [
      {
        id: 'takeover', taskId: '10', title: '風呂掃除', performedByUserId: '2', performedByName: 'Bさん',
        performedAt: '2026-10-31T15:00:00.000Z', dueDate: '2026-10-30', classification: 'overdue_takeover',
        takeoverFromUserId: '1', takeoverFromName: 'Aさん', takeoverAt: '2026-10-31T14:00:00.000Z', takeoverDueDate: '2026-10-30',
      },
      {
        id: 'normal', taskId: '10', title: '風呂掃除', performedByUserId: '1', performedByName: 'Aさん',
        performedAt: '2026-11-02T00:00:00.000Z', dueDate: '2026-11-02', classification: 'normal',
        takeoverFromUserId: null, takeoverFromName: null, takeoverAt: null, takeoverDueDate: null,
      },
      {
        id: 'legacy', taskId: '10', title: '風呂掃除', performedByUserId: '2', performedByName: 'Bさん',
        performedAt: '2026-11-01T00:00:00.000Z', dueDate: null, classification: 'unknown',
        takeoverFromUserId: null, takeoverFromName: null, takeoverAt: null, takeoverDueDate: null,
      },
    ],
  };
}

describe('MonthlyCompletions', () => {
  test('shows user totals, colored and labeled takeovers, and unknown historical records', async () => {
    server.use(http.get('/api/completions', ({ request }) => HttpResponse.json(report(new URL(request.url).searchParams.get('month')!))));
    renderWithProviders(<MonthlyCompletions />);
    const details = await screen.findByRole('region', { name: '実施記録の明細' });
    const takeover = within(details).getByText('期限後の巻き取り').closest('article');
    expect(takeover).toHaveClass('bg-orange-50');
    expect(takeover).toHaveTextContent('実施者：Bさん');
    expect(takeover).toHaveTextContent('巻き取り元：Aさん');
    expect(takeover).toHaveTextContent('2026/11/01 00:00');
    expect(within(details).getByText('巻き取り判定不明').closest('article')).toHaveClass('bg-white');
    expect(screen.getByRole('img', { name: 'Bさん：通常0件、期限後の巻き取り1件、判定不明1件' })).toBeInTheDocument();
    expect(screen.getByText('2件（うち巻き取り1件）')).toBeInTheDocument();
  });

  test('switches months and shows an empty month without the previous month records', async () => {
    const requested: string[] = [];
    server.use(http.get('/api/completions', ({ request }) => {
      const month = new URL(request.url).searchParams.get('month')!;
      requested.push(month);
      if (month === '2020-01') return HttpResponse.json({ ...report(month), totals: { total: 0, normal: 0, overdueTakeover: 0, unknown: 0 }, byUser: [], byTask: [], completions: [] });
      return HttpResponse.json(report(month));
    }));
    renderWithProviders(<MonthlyCompletions />);
    await screen.findByRole('region', { name: '実施記録の明細' });
    fireEvent.change(screen.getByLabelText('集計月'), { target: { value: '2020-01' } });
    expect(await screen.findByText('この月の実施記録はありません。')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '実施記録の明細' })).not.toBeInTheDocument();
    expect(requested).toContain('2020-01');
  });

  test('allows retrying a failed report request', async () => {
    const user = userEvent.setup();
    let failing = true;
    server.use(http.get('/api/completions', ({ request }) => failing
      ? HttpResponse.json({ error: { message: 'Failure' } }, { status: 500 })
      : HttpResponse.json(report(new URL(request.url).searchParams.get('month')!))));
    renderWithProviders(<MonthlyCompletions />);
    expect(await screen.findByRole('alert')).toHaveTextContent('実施記録を取得できませんでした。');
    failing = false;
    await user.click(screen.getByRole('button', { name: '更新' }));
    expect(await screen.findByRole('region', { name: '実施記録の明細' })).toBeInTheDocument();
  });
});
