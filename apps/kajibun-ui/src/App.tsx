import { QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MantineProvider, Modal } from '@mantine/core';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import '@mantine/core/styles.css';
import { PushNotificationButton } from './components/PushNotificationButton';
import { TaskAdmin } from './components/TaskAdmin';
import { TaskList } from './components/TaskList';
import { deleteCurrentUserAvatar, getCurrentUser, getLoginUrl, logout, updateCurrentUserProfile, uploadCurrentUserAvatar } from './lib/api';
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
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [shouldDeleteAvatar, setShouldDeleteAvatar] = useState(false);
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
    mutationFn: async (input: UserProfileInput) => {
      let user = await updateCurrentUserProfile(input);
      if (shouldDeleteAvatar) {
        user = (await deleteCurrentUserAvatar()) ?? user;
      }
      if (avatarFile) {
        user = await uploadCurrentUserAvatar(avatarFile);
      }

      return user;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['currentUser'], updatedUser);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsProfileDialogOpen(false);
      clearAvatarSelection();
    },
  });

  function openProfileDialog(user: User) {
    setProfileForm({
      name: user.name ?? '',
    });
    clearAvatarSelection();
    profileMutation.reset();
    setIsProfileDialogOpen(true);
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    profileMutation.mutate(profileForm);
  }

  function handleAvatarFileChange(file: File | null) {
    clearAvatarSelection();
    if (!file) {
      return;
    }

    setAvatarFile(file);
    setShouldDeleteAvatar(false);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  }

  function clearAvatarSelection() {
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarFile(null);
    setAvatarPreviewUrl(null);
    setShouldDeleteAvatar(false);
  }

  function closeProfileDialog() {
    setIsProfileDialogOpen(false);
    clearAvatarSelection();
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
          <Modal opened={isProfileDialogOpen} onClose={closeProfileDialog} title="プロフィール" centered>
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
                  アイコン画像
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => handleAvatarFileChange(event.target.files?.[0] ?? null)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900"
                  />
                </label>
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <UserAvatar
                      user={{
                        ...currentUser,
                        pictureUrl: shouldDeleteAvatar ? undefined : (avatarPreviewUrl ?? currentUser.pictureUrl),
                        name: profileForm.name,
                      }}
                    />
                    <span>{avatarFile ? avatarFile.name : shouldDeleteAvatar ? 'アイコンを削除します' : '現在のアイコン'}</span>
                  </div>
                  {currentUser.pictureUrl || avatarFile ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearAvatarSelection();
                        setShouldDeleteAvatar(true);
                      }}
                      className="text-sm font-medium text-red-600"
                    >
                      削除
                    </button>
                  ) : null}
                </div>
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
                  onClick={closeProfileDialog}
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
