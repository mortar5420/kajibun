import { QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MantineProvider, Modal } from '@mantine/core';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import '@mantine/core/styles.css';
import { PushNotificationButton } from './components/PushNotificationButton';
import { TaskAdmin } from './components/TaskAdmin';
import { TaskList } from './components/TaskList';
import { getCurrentUser, getLoginUrl, logout, updateCurrentUserProfile } from './lib/api';
import type { UserProfileInput } from './lib/api';
import { queryClient } from './lib/queryClient';
import type { User } from './types/user';

type Screen = 'today' | 'admin';

function AppContent() {
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>('today');
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<UserProfileInput>({
    name: '',
    pictureUrl: '',
  });
  const {
    data: currentUser,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
    retry: false,
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['currentUser'], null);
      queryClient.removeQueries({ queryKey: ['tasks'] });
    },
  });
  const profileMutation = useMutation({
    mutationFn: updateCurrentUserProfile,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['currentUser'], updatedUser);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsProfileDialogOpen(false);
    },
  });

  function openProfileDialog(user: User) {
    setProfileForm({
      name: user.name ?? '',
      pictureUrl: user.pictureUrl ?? '',
    });
    profileMutation.reset();
    setIsProfileDialogOpen(true);
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    profileMutation.mutate(profileForm);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">kajibun</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => openProfileDialog(currentUser)}
                  className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
                >
                  <UserAvatar user={currentUser} />
                  <span>{currentUser.name ?? currentUser.email}</span>
                </button>
                <PushNotificationButton />
                <button
                  type="button"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-60"
                >
                  ログアウト
                </button>
              </>
            ) : (
              <a
                href={getLoginUrl()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"
              >
                Google でログイン
              </a>
            )}
          </div>
        </header>

        {currentUser ? (
          <Modal opened={isProfileDialogOpen} onClose={() => setIsProfileDialogOpen(false)} title="プロフィール" centered>
            <form onSubmit={handleProfileSubmit}>
              <div className="grid gap-4">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  ユーザ名
                  <input
                    value={profileForm.name}
                    onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                    className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal text-slate-900"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  アイコンURL
                  <input
                    type="url"
                    value={profileForm.pictureUrl}
                    onChange={(event) => setProfileForm((current) => ({ ...current, pictureUrl: event.target.value }))}
                    placeholder="https://example.com/icon.png"
                    className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal text-slate-900"
                  />
                </label>
                {profileForm.pictureUrl ? (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <UserAvatar user={{ ...currentUser, pictureUrl: profileForm.pictureUrl, name: profileForm.name }} />
                    <span>プレビュー</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 flex gap-2">
                <button
                  type="submit"
                  disabled={profileMutation.isPending}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setIsProfileDialogOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
                >
                  キャンセル
                </button>
              </div>
              {profileMutation.isError ? <p className="mt-3 text-sm text-red-600">プロフィールを保存できませんでした。</p> : null}
            </form>
          </Modal>
        ) : null}

        {isLoading ? <StatusMessage>ログイン状態を確認しています。</StatusMessage> : null}
        {isError ? <StatusMessage>ログイン状態を取得できませんでした。</StatusMessage> : null}
        {!isLoading && !currentUser ? (
          <StatusMessage>許可された Google アカウントでログインしてください。</StatusMessage>
        ) : null}
        {currentUser ? (
          <>
            <nav className="mb-5 flex gap-2">
              <button
                type="button"
                onClick={() => setScreen('today')}
                className={screen === 'today' ? activeTabClassName : inactiveTabClassName}
              >
                今日のかじ
              </button>
              <button
                type="button"
                onClick={() => setScreen('admin')}
                className={screen === 'admin' ? activeTabClassName : inactiveTabClassName}
              >
                かじ管理
              </button>
            </nav>
            {screen === 'today' ? <TaskList currentUser={currentUser} /> : <TaskAdmin />}
          </>
        ) : null}
      </div>
    </main>
  );
}

const activeTabClassName = 'rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm';
const inactiveTabClassName =
  'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm';

function StatusMessage({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">{children}</div>;
}

function UserAvatar({ user }: { user: Pick<User, 'email' | 'name' | 'pictureUrl'> }) {
  const label = user.name ?? user.email;
  if (user.pictureUrl) {
    return <img src={user.pictureUrl} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />;
  }

  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function App() {
  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </MantineProvider>
  );
}

export default App;
