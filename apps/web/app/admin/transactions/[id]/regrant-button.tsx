'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { regrantAction } from '../../actions';

/** Re-runs the entitlement grant of a paid order. Safe to repeat: a granted order is unchanged (AS-ADM-08). */
export function RegrantButton({ orderId }: { orderId: string }) {
  const notify = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await regrantAction({ orderId });
          notify(result.message, result.ok ? 'success' : 'warning');
        })
      }
    >
      {pending ? 'Running…' : 'Re-run grant'}
    </Button>
  );
}
