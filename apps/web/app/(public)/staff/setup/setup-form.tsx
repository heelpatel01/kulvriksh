'use client';

import Link from 'next/link';
import { useActionState, useEffect, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';
import { Notice } from '@/components/ui/primitives';
import styles from '../../pages.module.css';
import { completePasswordLinkAction, type LinkState } from '../sign-in/actions';

// The one-time token is in the URL fragment (#token=…), which browsers never send to a server, so
// it does not appear in access or proxy logs. It is read once here and posted with the password.
let captured: string | undefined;
const readToken = () => (captured ??= new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
const noSubscription = () => () => {};

export function SetupForm() {
  // undefined while rendering on the server (no fragment there), the token in the browser.
  const token = useSyncExternalStore(noSubscription, readToken, () => undefined);
  const [state, action, pending] = useActionState<LinkState, FormData>(completePasswordLinkAction, {});

  useEffect(() => {
    // Remove the token from the address bar and history once it has been read.
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  if (state.done) {
    return (
      <Notice tone="success" title="Password set">
        Your password is saved. <Link href="/staff/sign-in">Sign in now</Link>.
      </Notice>
    );
  }
  if (token === undefined) {
    return <p>Checking your link…</p>;
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return (
      <Notice tone="danger" title="This link is incomplete">
        Open the full link you were given, or ask an administrator for a new one.
      </Notice>
    );
  }
  return (
    <form className={styles.formStack} action={action} noValidate>
      <input type="hidden" name="token" value={token} />
      <TextField id="setup-password" name="password" type="password" autoComplete="new-password" label="New password" hint="At least 12 characters." required error={state.fields?.password} />
      <TextField id="setup-confirm" name="confirm" type="password" autoComplete="new-password" label="Repeat the password" required error={state.fields?.confirm} />
      {state.error ? (
        <div role="alert">
          <Notice tone="danger">{state.error}</Notice>
        </div>
      ) : null}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Saving…' : 'Set password'}
        </Button>
      </div>
    </form>
  );
}
