import type { User } from '../../../types/user';

export function UserAvatar({ user }: { user: Pick<User, 'email' | 'name' | 'pictureUrl'> }) {
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
