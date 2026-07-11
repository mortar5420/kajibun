import { QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { useState } from 'react';
import type { ReactNode } from 'react';
import '@mantine/core/styles.css';
import { PushNotificationButton } from './components/PushNotificationButton';
import { TaskAdmin } from './components/TaskAdmin';
import { TaskList } from './components/TaskList';
import { ProfileDialog } from './features/profile/components/ProfileDialog';
import { UserAvatar } from './features/profile/components/UserAvatar';
import {
  deleteCurrentUserAvatar,
  getCurrentUser,
  getLoginUrl,
  logout,
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
} from './features/profile/api';
import type { ProfileSubmitInput } from './features/profile/model/profileForm';
import { queryClient } from './lib/queryClient';

type Screen = 'today' | 'admin';

function AppContent() {
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>('today');
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
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
    mutationFn: async (input: ProfileSubmitInput) => {
      let user = await updateCurrentUserProfile(input.profile);
      if (input.shouldDeleteAvatar) {
        user = (await deleteCurrentUserAvatar()) ?? user;
      }
      if (input.avatarFile) {
        user = await uploadCurrentUserAvatar(input.avatarFile);
      }

      return user;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['currentUser'], updatedUser);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsProfileDialogOpen(false);
    },
  });

  function openProfileDialog() {
    profileMutation.reset();
    setIsProfileDialogOpen(true);
  }

  function closeProfileDialog() {
    setIsProfileDialogOpen(false);
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
                  onClick={openProfileDialog}
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
          <ProfileDialog
            opened={isProfileDialogOpen}
            user={currentUser}
            isSaving={profileMutation.isPending}
            isError={profileMutation.isError}
            onClose={closeProfileDialog}
            onSubmit={(input) => profileMutation.mutate(input)}
          />
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
