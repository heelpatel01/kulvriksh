'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';
import { Notice } from '@/components/ui/primitives';
import styles from '../pages.module.css';
import { requestCodeAction, verifyCodeAction, type RequestCodeState } from './actions';

type CodeSent = Extract<RequestCodeState, { step: 'code' }>;

/** Seconds left until `until` (epoch ms), updated every second. */
function useCountdown(until: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function CodeStep({
  sent,
  next,
  resendAction,
  resending,
  onChangeNumber,
}: {
  sent: CodeSent;
  next: string;
  resendAction: (formData: FormData) => void;
  resending: boolean;
  onChangeNumber: () => void;
}) {
  const [state, verifyAction, verifying] = useActionState(verifyCodeAction, {});
  const [resendAt] = useState(() => Date.now() + sent.resendAfterSeconds * 1000);
  const wait = useCountdown(resendAt);

  return (
    <div className={styles.formStack}>
      <p>
        If <strong>{sent.mobileNumber}</strong> can sign in, a code is on its way. It expires in{' '}
        {Math.round(sent.expiresInSeconds / 60)} minutes.
      </p>
      {sent.notice ? <Notice tone="info">{sent.notice}</Notice> : null}
      {sent.devCode ? (
        <Notice tone="warning" title="Development inbox">
          No SMS is sent in local development. Your code is <strong data-dev-otp>{sent.devCode}</strong>.
        </Notice>
      ) : null}
      <form className={styles.formStack} action={verifyAction} noValidate>
        <input type="hidden" name="mobileNumber" value={sent.mobileNumber} />
        <input type="hidden" name="next" value={next} />
        <TextField
          id="sign-in-code"
          name="code"
          label="One-time code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          required
          autoFocus
          error={state.fields?.code}
        />
        {state.error ? (
          <div role="alert">
            <Notice tone="danger" title="Not signed in">
              {state.error}
            </Notice>
          </div>
        ) : null}
        <div className={styles.ctaRow}>
          <Button type="submit" size="lg" disabled={verifying}>
            {verifying ? 'Checking…' : 'Sign in'}
          </Button>
          <Button variant="ghost" onClick={onChangeNumber} disabled={verifying}>
            Use a different number
          </Button>
        </div>
      </form>
      <form action={resendAction}>
        <input type="hidden" name="mobileNumber" value={sent.mobileNumber} />
        <input type="hidden" name="resend" value="1" />
        <Button type="submit" variant="secondary" size="sm" disabled={wait > 0 || resending}>
          {wait > 0 ? `Resend code in ${wait}s` : resending ? 'Sending…' : 'Resend code'}
        </Button>
      </form>
    </div>
  );
}

// Customer sign-in with a one-time code (F-AUTH-01 to F-AUTH-03). Validation, limits and the
// session all live on the server; this component only collects input and shows the result.
export function SignInForm({ next }: { next: string }) {
  const [state, requestAction, requesting] = useActionState(requestCodeAction, { step: 'number' });
  const [dismissed, setDismissed] = useState<RequestCodeState>();

  if (state.step === 'code' && state !== dismissed) {
    return (
      <CodeStep
        key={state.issueId}
        sent={state}
        next={next}
        resendAction={requestAction}
        resending={requesting}
        onChangeNumber={() => setDismissed(state)}
      />
    );
  }

  const error = state.step === 'number' ? state.error : undefined;
  return (
    <form className={styles.formStack} action={requestAction} noValidate>
      <TextField
        id="sign-in-mobile"
        name="mobileNumber"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        label="Mobile number"
        hint="Indian mobile numbers only for now."
        placeholder="+91 98765 43210"
        defaultValue={state.mobileNumber}
        required
        error={error}
      />
      <div>
        <Button type="submit" size="lg" disabled={requesting}>
          {requesting ? 'Sending…' : 'Send one-time code'}
        </Button>
      </div>
    </form>
  );
}
