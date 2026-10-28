import type { GenealogistProfileView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { ButtonLink } from '@/components/ui/button';
import { Card, DetailList, Grid, Notice } from '@/components/ui/primitives';

// Real data only. The name and email are set by an admin when the account is created; there is no
// self-service edit in the agreed design. Availability (time away, capacity) is not designed yet.

export function GenealogistSettings({ profile }: { profile: GenealogistProfileView }) {
  const { reports } = profile;
  return (
    <div className={styles.stack}>
      <Grid>
        <Card title="Profile" description="Ask an admin if your name or email needs to change.">
          <DetailList
            items={[
              { label: 'Name', value: profile.displayName },
              { label: 'Email', value: profile.email },
              { label: 'Second factor', value: profile.mfaEnabled ? 'On' : 'Off' },
            ]}
          />
          <div className={styles.inlineActions}>
            <ButtonLink href="/genealogist/account" size="sm" variant="secondary">
              Password and second factor
            </ButtonLink>
          </div>
        </Card>
        <Card title="Your work">
          <DetailList
            items={[
              { label: 'Active assignments', value: profile.activeAssignments },
              { label: 'Reports in draft', value: reports.draft },
              { label: 'Reports awaiting review', value: reports.submitted },
              { label: 'Reports returned for changes', value: reports.returned },
              { label: 'Reports released', value: reports.released },
            ]}
          />
        </Card>
      </Grid>
      <Notice tone="info" title="Availability">
        Recording availability (time away or how many families you can take) is not part of the agreed design yet. Until it is, tell your admin directly.
      </Notice>
    </div>
  );
}
