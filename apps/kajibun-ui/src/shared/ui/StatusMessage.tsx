import type { ReactNode } from 'react';

export function StatusMessage({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">{children}</div>;
}
