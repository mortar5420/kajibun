import { describe, expect, test } from 'vitest';
import { normalizeProfileForm, userToProfileFormState } from './profileForm';
import type { User } from '../../../types/user';

describe('profile form model', () => {
  test('creates form state from the current user', () => {
    expect(
      userToProfileFormState({
        id: '1',
        sub: 'sub',
        email: 'me@example.com',
        name: '自分',
      } satisfies User),
    ).toEqual({
      name: '自分',
    });
  });

  test('normalizes profile form values', () => {
    expect(
      normalizeProfileForm({
        name: '  自分  ',
      }),
    ).toEqual({
      name: '自分',
    });
  });
});
