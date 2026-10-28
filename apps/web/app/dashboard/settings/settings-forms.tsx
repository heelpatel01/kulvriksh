'use client';

import { useState, useTransition, type FormEvent } from 'react';
import type { CustomerProfileView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button } from '@/components/ui/button';
import { FormActions, FormGrid, TextField } from '@/components/ui/form';
import { Card, Grid, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { updateProfileAction, type ActionResult } from '../actions';

// The profile is real and saved through the API. Only the fields the API reports as editable are
// shown; other profile fields wait for R8 and are not collected at all.

export function SettingsForms({ profile }: { profile: CustomerProfileView }) {
  const notify = useToast();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>();
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const editable = profile.editableFields.includes('displayName');

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start(async () => {
      const outcome = await updateProfileAction({ displayName });
      setResult(outcome);
      if (outcome.ok) {
        notify(outcome.message);
      }
    });
  }

  const error = result && !result.ok ? result : undefined;
  return (
    <div className={styles.stack}>
      <Card title="Profile" description="Other profile details will be added once they are agreed (R8). Nothing else is collected.">
        <form onSubmit={save} noValidate>
          <FormGrid>
            <TextField
              id="profile-display-name"
              name="displayName"
              label="What should we call you?"
              hint="Optional. Leave empty to be addressed by your account only."
              value={displayName}
              maxLength={80}
              disabled={!editable}
              onChange={(e) => setDisplayName(e.target.value)}
              error={error?.fields?.displayName}
            />
            <TextField
              id="profile-mobile"
              name="mobile"
              label="Mobile number"
              defaultValue={profile.mobileNumberMasked}
              disabled
              hint="Your sign-in number. Changing it is not available yet (FQ-6)."
            />
          </FormGrid>
          {error && !error.fields ? (
            <div role="alert">
              <Notice tone="danger">{error.message}</Notice>
            </div>
          ) : null}
          <FormActions>
            <Button type="submit" disabled={pending || !editable}>
              {pending ? 'Saving…' : 'Save profile'}
            </Button>
          </FormActions>
        </form>
      </Card>

      <Grid>
        <Card title="Notifications" description="Not available yet: events and channels are still being agreed (R36, R38).">
          <p className={styles.muted}>No notification preferences are stored. This section will appear when notifications exist.</p>
        </Card>
        <Card title="Your data">
          <div className={styles.stack}>
            <p className={styles.muted}>
              Account deletion, data export and retention rules are still to be agreed (R10). These options will appear here
              when they are available.
            </p>
            <div className={styles.inlineActions}>
              <Button variant="secondary" disabled>
                Download my data
              </Button>
              <Button variant="danger" disabled>
                Delete my account
              </Button>
            </div>
          </div>
        </Card>
      </Grid>
    </div>
  );
}
