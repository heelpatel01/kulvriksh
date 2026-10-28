'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/primitives';

/** Shown when the catalogue cannot be loaded. "Try again" re-requests the page from the server. */
export function ServicesUnavailable({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="alert">
      <EmptyState
        icon="alert"
        title="Our services could not be loaded"
        action={
          <Button
            variant="secondary"
            icon="activity"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                if (onRetry) {
                  onRetry();
                } else {
                  router.refresh();
                }
              })
            }
          >
            {pending ? 'Trying again…' : 'Try again'}
          </Button>
        }
      >
        This is temporary. Please try again in a moment.
      </EmptyState>
    </div>
  );
}
