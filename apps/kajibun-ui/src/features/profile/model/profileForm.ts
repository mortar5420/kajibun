import type { User } from '../../../types/user';
import type { UserProfileInput } from '../api';

export type ProfileFormState = UserProfileInput;

export type ProfileSubmitInput = {
  profile: UserProfileInput;
  avatarFile: File | null;
  shouldDeleteAvatar: boolean;
};

export function userToProfileFormState(user: User): ProfileFormState {
  return {
    name: user.name ?? '',
  };
}

export function normalizeProfileForm(form: ProfileFormState): UserProfileInput {
  return {
    name: form.name.trim(),
  };
}
