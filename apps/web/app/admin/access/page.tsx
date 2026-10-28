import type { Metadata } from 'next';
import Link from 'next/link';
import { firstFailure, LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { Badge, Card, DetailList, Notice, PageHeader } from '@/components/ui/primitives';
import { getAccessMatrix, getStaffAccounts } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { AdminAccounts } from './admin-accounts';

export const metadata: Metadata = { title: 'Roles & access' };

// The permissions the API enforces, generated from its own table, plus the policy settings that
// shape access and the staff accounts. Read only: no route changes a role. Accounts are managed
// on the Staff page.
export default async function AccessPage() {
  await requireStaff('admin');
  const [access, staff] = await Promise.all([getAccessMatrix(), getStaffAccounts()]);
  const header = (
    <PageHeader eyebrow="Operations" title="Roles & access" description="Who can do what. Every rule is checked by the API on every request; anything not listed is denied." />
  );
  const failed = firstFailure(access, staff);
  if (failed || access.kind !== 'ok' || staff.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={failed ?? { kind: 'unavailable' }} retryHref="/admin/access" />
      </>
    );
  }
  const { roles, permissions, policies } = access.data.access;
  return (
    <>
      {header}
      <div className={styles.stack}>
        <Notice tone="info">
          Customers act only on their own data, genealogists only on families they are currently assigned, through checks inside each request. Roles are set when an
          account is created and cannot be changed afterwards.
        </Notice>
        <Card title="Staff permissions" description="Generated from the API’s permission table.">
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.matrix}>
              <caption className="visually-hidden">Permissions by role</caption>
              <thead>
                <tr>
                  <th scope="col">Permission</th>
                  {roles.map((r) => (
                    <th key={r} scope="col">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map((p) => (
                  <tr key={p.key}>
                    <th scope="row" style={{ fontWeight: 600, padding: 'var(--space-2) var(--space-3)', textAlign: 'left' }}>
                      <span className={styles.mono}>{p.key}</span>
                      <span className={styles.cellMeta}>{p.description}</span>
                    </th>
                    {roles.map((r) => (
                      <td
                        key={r}
                        className={p.roles.includes(r) ? styles.yes : styles.no}
                        style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--color-border)', fontSize: 'var(--text-sm)' }}
                      >
                        {p.roles.includes(r) ? 'Yes' : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Access policies" description="Current settings and the decision each one is waiting for.">
          <DetailList
            items={policies.map((p) => ({
              label: p.name,
              value: (
                <>
                  {p.value} <Badge>{p.decision}</Badge>
                </>
              ),
            }))}
          />
        </Card>
        <AdminAccounts staff={staff.data.staff} />
        <p className={styles.muted}>
          Create, deactivate or reset staff accounts on the <Link href="/admin/staff">Staff</Link> page.
        </p>
      </div>
    </>
  );
}
