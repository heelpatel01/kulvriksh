import Link from 'next/link';
import type { AdminCustomerSummary } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button, ButtonLink } from '@/components/ui/button';
import tables from '@/components/ui/interactive.module.css';
import { EmptyState } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatDateTime } from '@/lib/format';
import { ACCOUNT_STATUS } from '@/lib/status';

// Server-rendered: the search box is a plain GET form and pages are links, so every view is an
// API query with the admin's own session.

const STATUS = { ...ACCOUNT_STATUS, deactivated: ACCOUNT_STATUS.inactive! };

export function CustomersTable({ customers, query, nextBefore, paged }: { customers: AdminCustomerSummary[]; query: string; nextBefore: string | null; paged: boolean }) {
  const base = `/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`;
  return (
    <div className={styles.stack}>
      <form method="get" action="/admin/customers" className={styles.inlineActions} role="search">
        <label htmlFor="customer-search" className="visually-hidden">
          Search customers
        </label>
        <input id="customer-search" name="q" defaultValue={query} placeholder="Name or mobile digits" maxLength={60} className={tables.filterSelect} />
        <Button type="submit" size="sm" variant="secondary" icon="search">
          Search
        </Button>
        {query ? (
          <ButtonLink href="/admin/customers" size="sm" variant="ghost">
            Clear
          </ButtonLink>
        ) : null}
      </form>
      {customers.length === 0 ? (
        <EmptyState icon="users" title={query ? 'No customers match' : paged ? 'No older customers' : 'No customers yet'}>
          {query ? 'Try a different name or more digits of the number.' : 'Customers appear after their first sign-in.'}
        </EmptyState>
      ) : (
        <div className={tables.tableScroll}>
          <table className={tables.table} aria-label="Customers">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Family workspace</th>
                <th scope="col">Paid orders</th>
                <th scope="col">Joined</th>
                <th scope="col">Last seen</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/customers/${c.id}`} className={styles.cellTitle}>
                      {c.displayName ?? 'No name given'}
                    </Link>
                    <span className={`${styles.cellMeta} ${styles.mono}`}>{c.mobileMasked}</span>
                  </td>
                  <td>{c.workspace ? `${c.workspace.name} (${c.workspace.memberCount} people)` : '—'}</td>
                  <td>{c.paidOrders}</td>
                  <td>{formatDate(c.createdAt)}</td>
                  <td>{c.lastSeenAt ? formatDateTime(c.lastSeenAt) : '—'}</td>
                  <td>
                    <StatusBadge map={STATUS} value={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paged || nextBefore ? (
        <div className={styles.inlineActions}>
          {paged ? (
            <ButtonLink href={base} size="sm" variant="ghost">
              Newest
            </ButtonLink>
          ) : null}
          {nextBefore ? (
            <ButtonLink href={`${base}${query ? '&' : '?'}before=${encodeURIComponent(nextBefore)}`} size="sm" variant="secondary">
              Older
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
