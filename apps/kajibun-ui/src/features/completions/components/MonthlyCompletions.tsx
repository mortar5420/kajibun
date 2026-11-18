import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StatusMessage } from '../../../shared/ui/StatusMessage';
import { getMonthlyCompletions } from '../api';
import type { Completion, MonthlyCompletions as MonthlyData } from '../api';

export function MonthlyCompletions() {
  const [month, setMonth] = useState(currentMonth);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['completions', month],
    queryFn: () => getMonthlyCompletions(month),
  });

  return (
    <section className="space-y-5" aria-label="月ごとの実施記録">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">月ごとの実施記録</h2>
          <p className="mt-1 text-sm text-slate-600">「終わった」を押した人と日時を記録し、日本時間の実施月で集計します。</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="grid gap-1 text-sm text-slate-700">
            集計月
            <input
              type="month"
              min="1000-01"
              max="9999-12"
              value={month}
              onChange={(event) => {
                if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value);
              }}
              className="min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
            />
          </label>
          <button type="button" onClick={() => refetch()} disabled={isFetching}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60">更新</button>
        </div>
      </div>
      <p className="text-sm text-slate-600">
        期限後の巻き取り：期限日の翌日以降に、相手から引き取って実施した家事です。実施件数の内数として表示します。
      </p>
      {isLoading ? <StatusMessage>実施記録を読み込んでいます。</StatusMessage> : null}
      {isError ? <p role="alert" className="text-sm text-red-700">実施記録を取得できませんでした。更新して再度お試しください。</p> : null}
      {data && !isError ? <MonthlyResults data={data} /> : null}
    </section>
  );
}

function MonthlyResults({ data }: { data: MonthlyData }) {
  const maxTotal = Math.max(1, ...data.byUser.map((user) => user.total));
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">実施件数</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{data.totals.total}<span className="ml-1 text-sm font-normal">件</span></p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm text-orange-800">うち期限後の巻き取り</p>
          <p className="mt-1 text-2xl font-semibold text-orange-900">{data.totals.overdueTakeover}<span className="ml-1 text-sm font-normal">件</span></p>
        </div>
      </div>
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4" aria-label="ユーザ別の実施件数">
        <h3 className="font-semibold text-slate-900">ユーザ別</h3>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-sky-600" />通常</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-orange-500" />期限後の巻き取り</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-slate-400" />判定不明</span>
        </div>
        {data.byUser.map((user) => (
          <div key={user.userId ?? 'unknown'}>
            <p className="mb-1 flex flex-wrap justify-between gap-1 text-sm text-slate-700">
              <span>{user.name}</span><span>{user.total}件（うち巻き取り{user.overdueTakeover}件）</span>
            </p>
            <div role="img" aria-label={`${user.name}：通常${user.normal}件、期限後の巻き取り${user.overdueTakeover}件、判定不明${user.unknown}件`}
              className="flex h-6 overflow-hidden rounded bg-slate-100">
              <span className="bg-sky-600" style={{ width: `${user.normal / maxTotal * 100}%` }} />
              <span className="bg-orange-500" style={{ width: `${user.overdueTakeover / maxTotal * 100}%` }} />
              <span className="bg-slate-400" style={{ width: `${user.unknown / maxTotal * 100}%` }} />
            </div>
          </div>
        ))}
        {data.totals.unknown > 0 ? <p className="text-xs text-slate-500">判定不明は、当時の期限や担当変更を確認できない記録です。実施件数には含みます。</p> : null}
      </section>
      {data.totals.total === 0 ? <StatusMessage>この月の実施記録はありません。</StatusMessage> : (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4" aria-label="家事別の実施件数">
            <h3 className="mb-3 font-semibold text-slate-900">家事別</h3>
            <ul className="divide-y divide-slate-100">
              {data.byTask.map((task) => <li key={task.taskId} className="flex justify-between gap-3 py-2 text-sm text-slate-700">
                <span>{task.title}</span><span className="shrink-0">{task.total}件（うち巻き取り{task.overdueTakeover}件）</span>
              </li>)}
            </ul>
          </section>
          <section className="space-y-3" aria-label="実施記録の明細">
            <h3 className="font-semibold text-slate-900">実施記録</h3>
            {data.completions.map((completion) => <CompletionDetail key={completion.id} completion={completion} />)}
          </section>
        </>
      )}
    </>
  );
}

function CompletionDetail({ completion }: { completion: Completion }) {
  const isTakeover = completion.classification === 'overdue_takeover';
  return (
    <article className={`rounded-lg border p-4 ${isTakeover ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-slate-900">{completion.title}</h4>
        {isTakeover ? <span className="rounded bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">期限後の巻き取り</span> : null}
        {completion.classification === 'unknown' ? <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">巻き取り判定不明</span> : null}
      </div>
      <p className="mt-2 text-sm text-slate-700">実施者：{completion.performedByName}</p>
      <p className="mt-1 text-sm text-slate-600"><time dateTime={completion.performedAt}>{formatDateTime(completion.performedAt)}</time>（日本時間）</p>
      <p className="mt-1 text-sm text-slate-600">期限：{completion.dueDate ?? '記録なし・未設定'}</p>
      {isTakeover ? <p className="mt-2 text-sm text-orange-800">
        巻き取り元：{completion.takeoverFromName ?? '不明なユーザ'} ／ 引き取り時点の期限：{completion.takeoverDueDate}
        {completion.takeoverAt ? <span className="mt-1 block">引き取り日時：{formatDateTime(completion.takeoverAt)}（日本時間）</span> : null}
      </p> : null}
    </article>
  );
}

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
