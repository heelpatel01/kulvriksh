import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/auth/session';
import styles from '@/components/portal/portal-pages.module.css';
import { ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Card, Grid, StatCard, StatGrid } from '@/components/ui/primitives';
import { getMyFamilyTree, getMyProfile, getMyReleasedReports } from '@/lib/api/portal';
import { formatDate } from '@/lib/format';

// The area's title template applies to child segments only, so this title is absolute.
export const metadata: Metadata = { title: { absolute: 'Overview · Customer · Kulvriksh' } };

// Real data only: the customer's profile, family workspace and released reports.
export default async function CustomerOverviewPage() {
  await requireCustomer();
  const [profile, tree, reports] = await Promise.all([getMyProfile(), getMyFamilyTree(), getMyReleasedReports()]);
  const name = profile.kind === 'ok' ? profile.data.profile.displayName : null;
  const workspace = tree.kind === 'ok' ? tree.data.workspace : null;
  const count = (value: number | undefined) => (value === undefined ? '—' : value);

  return (
    <>
      <section className={styles.welcome} aria-labelledby="welcome-title">
        <div>
          <h1 id="welcome-title" className={styles.welcomeTitle}>
            {name ? `Welcome back, ${name}` : 'Welcome back'}
          </h1>
          <p className={styles.welcomeText}>
            {workspace
              ? `The ${workspace.name} workspace was last updated on ${formatDate(workspace.updatedAt)}.`
              : tree.kind === 'not_found'
                ? 'Start your private family workspace to begin your tree.'
                : 'Your workspace could not be loaded just now.'}
          </p>
        </div>
        <div className={styles.welcomeActions}>
          <ButtonLink href="/dashboard/family" variant="secondary" icon="tree">
            {workspace ? 'Open family tree' : 'Create your workspace'}
          </ButtonLink>
        </div>
      </section>

      <StatGrid>
        <StatCard label="Family members" value={count(workspace?.memberCount)} icon="users" />
        <StatCard label="Relationships" value={count(workspace?.relationshipCount)} icon="tree" />
        <StatCard
          label="Released reports"
          value={reports.kind === 'ok' ? reports.data.reports.length : '—'}
          hint="Ready to read"
          icon="file"
        />
      </StatGrid>

      <Grid>
        <Card title="Next steps">
          <ul className={styles.rowList}>
            <li className={styles.row}>
              <span className={styles.rowIcon}>
                <Icon name="users" size={16} />
              </span>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>Add more family members</p>
                <p className={styles.rowMeta}>Grandparents’ siblings help genealogists find older records.</p>
              </div>
              <ButtonLink href="/dashboard/family" size="sm" variant="secondary">
                Add
              </ButtonLink>
            </li>
            <li className={styles.row}>
              <span className={styles.rowIcon}>
                <Icon name="file" size={16} />
              </span>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>Read released reports</p>
                <p className={styles.rowMeta}>Reports appear once reviewed by our team.</p>
              </div>
              <ButtonLink href="/dashboard/research" size="sm" variant="secondary">
                View
              </ButtonLink>
            </li>
          </ul>
        </Card>
        <Card title="Not built yet">
          <p className={styles.muted}>Photos, documents and voices, plans and payments are previews with sample data for now.</p>
        </Card>
      </Grid>
    </>
  );
}
