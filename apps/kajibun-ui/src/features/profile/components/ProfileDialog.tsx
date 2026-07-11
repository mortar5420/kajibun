import { Modal } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '../../../types/user';
import { normalizeProfileForm, userToProfileFormState } from '../model/profileForm';
import type { ProfileFormState, ProfileSubmitInput } from '../model/profileForm';
import { UserAvatar } from './UserAvatar';

type ProfileDialogProps = {
  opened: boolean;
  user: User;
  isSaving: boolean;
  isError: boolean;
  onClose: () => void;
  onSubmit: (input: ProfileSubmitInput) => void;
};

export function ProfileDialog({ opened, user, isSaving, isError, onClose, onSubmit }: ProfileDialogProps) {
  const [form, setForm] = useState<ProfileFormState>(() => userToProfileFormState(user));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [shouldDeleteAvatar, setShouldDeleteAvatar] = useState(false);

  useEffect(() => {
    if (!opened) {
      clearAvatarSelection();
      return;
    }

    setForm(userToProfileFormState(user));
    clearAvatarSelection();
  }, [opened, user]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      profile: normalizeProfileForm(form),
      avatarFile,
      shouldDeleteAvatar,
    });
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
    setAvatarPreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return null;
    });
    setAvatarFile(null);
    setShouldDeleteAvatar(false);
  }

  function handleDeleteAvatar() {
    clearAvatarSelection();
    setShouldDeleteAvatar(true);
  }

  return (
    <Modal opened={opened} onClose={onClose} title="プロフィール" centered>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            ユーザ名
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
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
                  ...user,
                  pictureUrl: shouldDeleteAvatar ? undefined : (avatarPreviewUrl ?? user.pictureUrl),
                  name: form.name,
                }}
              />
              <span>{avatarFile ? avatarFile.name : shouldDeleteAvatar ? 'アイコンを削除します' : '現在のアイコン'}</span>
            </div>
            {user.pictureUrl || avatarFile ? (
              <button type="button" onClick={handleDeleteAvatar} className="text-sm font-medium text-red-600">
                削除
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
          >
            キャンセル
          </button>
        </div>
        {isError ? <p className="mt-3 text-sm text-red-600">プロフィールを保存できませんでした。</p> : null}
      </form>
    </Modal>
  );
}
