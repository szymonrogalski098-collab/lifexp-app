// Whether this account is the bug-report admin, asked of the server once per account
// (data/repos/admin). undefined = not known yet; offline it stays unknown and the
// admin's views stay hidden until the next try.
import { signal } from '@preact/signals';

export const admin = signal<{ uid: string | null; isAdmin: boolean | undefined }>({ uid: null, isAdmin: undefined });

export function checkAdmin(uid: string): void {
  if (admin.peek().uid === uid && admin.peek().isAdmin !== undefined) return;
  admin.value = { uid, isAdmin: undefined };
  void import('@/data/repos/admin')
    .then((repo) => repo.probeAdmin())
    .then((isAdmin) => {
      if (admin.peek().uid === uid) admin.value = { uid, isAdmin };
    })
    .catch(() => {});
}
