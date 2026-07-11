import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import type { User } from '../../../types/user';
import { ProfileDialog } from './ProfileDialog';

const currentUser: User = {
  id: '1',
  sub: 'sub',
  email: 'me@example.com',
  name: '自分',
  pictureUrl: 'https://example.com/avatar.png',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfileDialog', () => {
  test('submits normalized profile values with delete avatar intent', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithProviders(
      <ProfileDialog
        opened
        user={currentUser}
        isSaving={false}
        isError={false}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const nameInput = screen.getByLabelText('ユーザ名');
    await user.clear(nameInput);
    await user.type(nameInput, '  新しい名前  ');
    await user.click(screen.getByRole('button', { name: '削除' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByText('アイコンを削除します')).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({
      profile: {
        name: '新しい名前',
      },
      avatarFile: null,
      shouldDeleteAvatar: true,
    });
  });

  test('submits selected avatar file', async () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar-preview');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    renderWithProviders(
      <ProfileDialog
        opened
        user={currentUser}
        isSaving={false}
        isError={false}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.upload(screen.getByLabelText('アイコン画像'), file);
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByText('avatar.png')).toBeInTheDocument();
    expect(createObjectUrl).toHaveBeenCalledWith(file);
    expect(onSubmit).toHaveBeenCalledWith({
      profile: {
        name: '自分',
      },
      avatarFile: file,
      shouldDeleteAvatar: false,
    });
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });
});
