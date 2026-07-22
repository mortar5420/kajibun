import type { ReactNode } from 'react';
import { ProfileDialog } from '../features/profile/components/ProfileDialog';
import { UserAvatar } from '../features/profile/components/UserAvatar';
import { getLoginUrl } from '../features/profile/api';
import type { ProfileSubmitInput } from '../features/profile/model/profileForm';
import { PushNotificationButton } from '../features/push-notifications/components/PushNotificationButton';
import type { User } from '../types/user';
import logoUrl from '../assets/logo.png';

type Screen = 'today' | 'admin';

type AppShellProps = {
  currentUser: User | null | undefined;
  screen: Screen;
  isProfileDialogOpen: boolean;
  isLogoutPending: boolean;
  isProfileSaving: boolean;
  isProfileError: boolean;
  onScreenChange: (screen: Screen) => void;
  onOpenProfileDialog: () => void;
  onCloseProfileDialog: () => void;
  onLogout: () => void;
  onProfileSubmit: (input: ProfileSubmitInput) => void;
  children: ReactNode;
};

export function AppShell({
  currentUser,
  screen,
  isProfileDialogOpen,
  isLogoutPending,
  isProfileSaving,
  isProfileError,
  onScreenChange,
  onOpenProfileDialog,
  onCloseProfileDialog,
  onLogout,
  onProfileSubmit,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <img src={logoUrl} alt="kajibun" className="h-8 w-auto" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={onOpenProfileDialog}
                  className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
                >
                  <UserAvatar user={currentUser} />
                  <span>{currentUser.name ?? currentUser.email}</span>
                </button>
                <PushNotificationButton />
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={isLogoutPending}
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
            isSaving={isProfileSaving}
            isError={isProfileError}
            onClose={onCloseProfileDialog}
            onSubmit={onProfileSubmit}
          />
        ) : null}

        {currentUser ? (
          <nav className="mb-5 flex gap-2">
            <button
              type="button"
              onClick={() => onScreenChange('today')}
              className={screen === 'today' ? activeTabClassName : inactiveTabClassName}
            >
              今日のかじ
            </button>
            <button
              type="button"
              onClick={() => onScreenChange('admin')}
              className={screen === 'admin' ? activeTabClassName : inactiveTabClassName}
            >
              かじ管理
            </button>
          </nav>
        ) : null}

        {children}
      </div>
    </main>
  );
}

const activeTabClassName = 'rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm';
const inactiveTabClassName =
  'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm';
