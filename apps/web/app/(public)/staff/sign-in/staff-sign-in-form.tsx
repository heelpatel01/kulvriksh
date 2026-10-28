'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';
import { Notice } from '@/components/ui/primitives';
import styles from '../../pages.module.css';
import { staffSignInAction, type StaffSignInState } from './actions';

function ErrorNotice({ message }: { message?: string }) {
  return message ? (
    <div role="alert">
      <Notice tone="danger" title="Not signed in">
        {message}
      </Notice>
    </div>
  ) : null;
}

export function StaffSignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<StaffSignInState, FormData>(staffSignInAction, { step: 'password' });

  if (state.step === 'code') {
    return (
      <form className={styles.formStack} action={action} noValidate>
        <input type="hidden" name="step" value="code" />
        <input type="hidden" name="challengeToken" value={state.challengeToken} />
        <input type="hidden" name="next" value={next} />
        <p>Enter the 6-digit code from your authenticator app.</p>
        <TextField id="staff-code" name="code" label="Authentication code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
        <ErrorNotice message={state.error} />
        <div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? 'Checking…' : 'Verify'}
          </Button>
        </div>
      </form>
    );
  }

  if (state.step === 'enrol') {
    return (
      <div className={styles.formStack}>
        <Notice tone="info" title="Set up two-step sign-in">
          Your role requires a second step at every sign-in. Add this account to an authenticator app, then enter the code it shows.
        </Notice>
        {state.enrolment ? (
          <form className={styles.formStack} action={action} noValidate>
            <input type="hidden" name="step" value="enrol-confirm" />
            <input type="hidden" name="challengeToken" value={state.challengeToken} />
            <input type="hidden" name="next" value={next} />
            <p>
              Secret key (enter it in the app, shown only now): <code data-mfa-secret>{state.enrolment.secret}</code>
            </p>
            <p>
              Or open this link on the device with the app: <a href={state.enrolment.otpauthUri}>add to authenticator</a>
            </p>
            <TextField id="staff-enrol-code" name="code" label="Code from the app" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
            <ErrorNotice message={state.error} />
            <div>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? 'Checking…' : 'Turn on and sign in'}
              </Button>
            </div>
          </form>
        ) : (
          <form action={action}>
            <input type="hidden" name="step" value="enrol-start" />
            <input type="hidden" name="challengeToken" value={state.challengeToken} />
            <ErrorNotice message={state.error} />
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? 'Preparing…' : 'Show my setup key'}
            </Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form className={styles.formStack} action={action} noValidate>
      <input type="hidden" name="step" value="password" />
      <input type="hidden" name="next" value={next} />
      <TextField id="staff-email" name="email" type="email" autoComplete="username" label="Work email" defaultValue={state.email} required error={state.fields?.email} />
      <TextField id="staff-password" name="password" type="password" autoComplete="current-password" label="Password" required error={state.fields?.password} />
      <ErrorNotice message={state.error} />
      <div className={styles.ctaRow}>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
        <Link href="/staff/reset">Forgot your password?</Link>
      </div>
    </form>
  );
}
