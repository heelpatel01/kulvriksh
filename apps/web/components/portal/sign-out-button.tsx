'use client';

import { useTransition } from 'react';
import { Icon } from '../ui/icon';
import styles from './portal-shell.module.css';

/**
 * Ends the session on the server (the given Server Action), then performs a full-document
 * navigation (F-AUTH-04), so no private page stays in the client-side router cache and Back
 * cannot show it again.
 */
export function SignOutButton({ action, redirectTo }: { action: () => Promise<void>; redirectTo: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={styles.exitLink}
      aria-label="Sign out"
      title="Sign out"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await action();
          window.location.replace(redirectTo);
        })
      }
    >
      <Icon name="logout" size={16} />
    </button>
  );
}
