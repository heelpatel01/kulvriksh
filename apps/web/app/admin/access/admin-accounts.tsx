'use client';

import type { StaffAccountView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge, Card } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/format';
import { ACCOUNT_STATUS } from '@/lib/status';

// Real staff accounts and their roles (read only here).

const STATUS = { ...ACCOUNT_STATUS, deactivated: ACCOUNT_STATUS.inactive! };

const columns: Column<StaffAccountView>[] = [
  {
    key: 'name',
    header: 'Person',
    sortValue: (a) => a.displayName,
    render: (a) => (
      <>
        <span className={styles.cellTitle}>{a.displayName}</span>
        <span className={styles.cellMeta}>{a.email}</span>
      </>
    ),
  },
  { key: 'role', header: 'Role', sortValue: (a) => a.role, render: (a) => <Badge tone={a.role === 'admin' ? 'accent' : 'info'}>{a.role}</Badge> },
  { key: 'mfa', header: 'Second factor', hideOnMobile: true, render: (a) => (a.mfaEnabled ? 'On' : 'Off') },
  { key: 'since', header: 'Since', hideOnMobile: true, sortValue: (a) => a.createdAt, render: (a) => formatDate(a.createdAt) },
  { key: 'status', header: 'Status', render: (a) => <StatusBadge map={STATUS} value={a.status} /> },
];

export function AdminAccounts({ staff }: { staff: StaffAccountView[] }) {
  return (
    <Card title="Staff accounts" padded={false}>
      <DataTable
        caption="Staff accounts"
        rows={staff}
        columns={columns}
        getRowId={(a) => a.id}
        getSearchText={(a) => `${a.displayName} ${a.email} ${a.role}`}
        searchLabel="Search staff"
        filters={[{ key: 'role', label: 'Role', options: [{ value: 'admin', label: 'Admin' }, { value: 'genealogist', label: 'Genealogist' }], getValue: (a) => a.role }]}
        pageSize={10}
      />
    </Card>
  );
}
