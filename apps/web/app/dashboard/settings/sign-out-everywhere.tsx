'use client';

import { useTransition } from 'react';
import { signOutEverywhereAction } from '@/app/(public)/sign-in/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';

/** Ends every session of this account on the server, including this one, then reloads (F-AUTH-04). */
export function SignOutEverywhere() {
  const [pending, startTransition] = useTransition();
  return (
    <Card
      title="Signed-in devices"
      description="Sign out on every phone and computer where this account is signed in, including this one."
    >
      <Button
        variant="secondary"
        icon="logout"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await signOutEverywhereAction();
            window.location.replace('/sign-in');
          })
        }
      >
        {pending ? 'Signing out…' : 'Sign out of all devices'}
      </Button>
    </Card>
  );
}
