'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';
import { Notice } from '@/components/ui/primitives';
import styles from '../../pages.module.css';
import { requestPasswordResetAction, type ResetRequestState } from '../sign-in/actions';

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(requestPasswordResetAction, {});
  if (state.sent) {
    // Deliberately the same message for every email (no account enumeration).
    return (
      <Notice tone="info" title="Check your email">
        If this email belongs to a staff account, a reset link is on its way. No email provider is connected yet, so in this
        environment an administrator can issue the link instead.
      </Notice>
    );
  }
  return (
    <form className={styles.formStack} action={action} noValidate>
      <TextField id="reset-email" name="email" type="email" autoComplete="username" label="Work email" required />
      {state.error ? (
        <div role="alert">
          <Notice tone="danger">{state.error}</Notice>
        </div>
      ) : null}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Sending…' : 'Send reset link'}
        </Button>
      </div>
    </form>
  );
}
