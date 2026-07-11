import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppProviders } from './app/providers';
import { AppShell } from './app/AppShell';
import { TaskAdmin } from './components/TaskAdmin';
import { TaskList } from './components/TaskList';
import {
  deleteCurrentUserAvatar,
  getCurrentUser,
  logout,
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
} from './features/profile/api';
import type { ProfileSubmitInput } from './features/profile/model/profileForm';
import { StatusMessage } from './shared/ui/StatusMessage';

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
    <AppShell
      currentUser={currentUser}
      screen={screen}
      isProfileDialogOpen={isProfileDialogOpen}
      isLogoutPending={logoutMutation.isPending}
      isProfileSaving={profileMutation.isPending}
      isProfileError={profileMutation.isError}
      onScreenChange={setScreen}
      onOpenProfileDialog={openProfileDialog}
      onCloseProfileDialog={closeProfileDialog}
      onLogout={() => logoutMutation.mutate()}
      onProfileSubmit={(input) => profileMutation.mutate(input)}
    >
      {isLoading ? <StatusMessage>ログイン状態を確認しています。</StatusMessage> : null}
      {isError ? <StatusMessage>ログイン状態を取得できませんでした。</StatusMessage> : null}
      {!isLoading && !currentUser ? (
        <StatusMessage>許可された Google アカウントでログインしてください。</StatusMessage>
      ) : null}
      {currentUser ? screen === 'today' ? <TaskList currentUser={currentUser} /> : <TaskAdmin /> : null}
    </AppShell>
  );
}

function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}

export default App;
