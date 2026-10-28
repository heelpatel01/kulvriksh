'use client';

import { useState, useTransition } from 'react';
import type { StaffMfaEnrolment } from '@kulvriksh/shared';
import { changeStaffPasswordAction, confirmMfaAction, disableMfaAction, startMfaAction, type AccountResult } from '@/lib/actions/staff-account';
import { Button } from '../ui/button';
import { FormActions, TextField } from '../ui/form';
import { Badge, Card, Grid, Notice } from '../ui/primitives';
import { useToast } from '../ui/toast';
import styles from './portal-pages.module.css';

// Real: password change and the TOTP second factor for the signed-in staff member.
export function StaffAccountPanel({ area, mfa }: { area: 'admin' | 'genealogist'; mfa: { enabled: boolean; required: boolean; available: boolean; policy: string } }) {
  const notify = useToast();
  const [pending, start] = useTransition();
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [passwordResult, setPasswordResult] = useState<AccountResult>();
  const [enrolment, setEnrolment] = useState<StaffMfaEnrolment>();
  const [code, setCode] = useState('');
  const [mfaResult, setMfaResult] = useState<AccountResult>();

  const run = (action: () => Promise<AccountResult>, onDone: (r: AccountResult) => void) =>
    start(async () => {
      const result = await action();
      onDone(result);
      if (result.ok) {
        notify(result.message);
      }
    });

  const passwordError = passwordResult && !passwordResult.ok ? passwordResult : undefined;
  return (
    <Grid>
      <Card title="Password" description="At least 12 characters. Changing it signs out your other devices.">
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            run(() => changeStaffPasswordAction(password), (r) => {
              setPasswordResult(r);
              if (r.ok) {
                setPassword({ currentPassword: '', newPassword: '' });
              }
            });
          }}
        >
          <TextField
            id="current-password"
            type="password"
            autoComplete="current-password"
            label="Current password"
            value={password.currentPassword}
            onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })}
            error={passwordError?.fields?.currentPassword}
          />
          <TextField
            id="new-password"
            type="password"
            autoComplete="new-password"
            label="New password"
            value={password.newPassword}
            onChange={(e) => setPassword({ ...password, newPassword: e.target.value })}
            error={passwordError?.fields?.newPassword}
          />
          {passwordError && !passwordError.fields ? (
            <div role="alert">
              <Notice tone="danger">{passwordError.message}</Notice>
            </div>
          ) : null}
          <FormActions>
            <Button type="submit" disabled={pending || !password.currentPassword || !password.newPassword}>
              Change password
            </Button>
          </FormActions>
        </form>
      </Card>

      <Card title="Two-step sign-in" description="A code from an authenticator app at every sign-in (TOTP).">
        <div className={styles.stack}>
          <p>
            Status: <Badge tone={mfa.enabled ? 'success' : 'neutral'}>{mfa.enabled ? 'On' : 'Off'}</Badge>
            {mfa.required ? <> · required for your role</> : null}
          </p>
          {!mfa.available ? <Notice tone="info">Two-step sign-in is not available on this server (STAFF_MFA / STAFF_MFA_KEY).</Notice> : null}
          {!mfa.enabled && !enrolment && mfa.available ? (
            <Button disabled={pending} onClick={() => run(startMfaAction, (r) => (r.ok && r.enrolment ? setEnrolment(r.enrolment) : setMfaResult(r)))}>
              Set up two-step sign-in
            </Button>
          ) : null}
          {enrolment && !mfa.enabled ? (
            <p>
              Key for your app (shown once): <code data-mfa-secret>{enrolment.secret}</code>
            </p>
          ) : null}
          {(enrolment && !mfa.enabled) || (mfa.enabled && !mfa.required) ? (
            <form
              className={styles.stack}
              onSubmit={(event) => {
                event.preventDefault();
                run(() => (mfa.enabled ? disableMfaAction({ code }, area) : confirmMfaAction({ code }, area)), (r) => {
                  setMfaResult(r);
                  if (r.ok) {
                    setCode('');
                    setEnrolment(undefined);
                  }
                });
              }}
            >
              <TextField id="mfa-code" label="Current code from the app" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
              <FormActions>
                <Button type="submit" variant={mfa.enabled ? 'danger' : 'primary'} disabled={pending || code.length !== 6}>
                  {mfa.enabled ? 'Turn off' : 'Turn on'}
                </Button>
              </FormActions>
            </form>
          ) : null}
          {mfaResult && !mfaResult.ok ? (
            <div role="alert">
              <Notice tone="danger">{mfaResult.message}</Notice>
            </div>
          ) : null}
        </div>
      </Card>
    </Grid>
  );
}
