'use client';

import { useState, useTransition } from 'react';
import type { GenealogistSummary } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { setGenealogistStatusAction } from '../actions';

// Real data. Deactivating a genealogist revokes their sessions on the server immediately and
// blocks sign-in and new assignments; existing assignments are kept for history.
export function GenealogistsTable({ genealogists }: { genealogists: GenealogistSummary[] }) {
  const notify = useToast();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<GenealogistSummary>();
  const [error, setError] = useState<string>();

  const columns: Column<GenealogistSummary>[] = [
    { key: 'name', header: 'Name', render: (g) => <span className={styles.cellTitle}>{g.displayName}</span>, sortValue: (g) => g.displayName },
    { key: 'email', header: 'Email', render: (g) => g.email, hideOnMobile: true },
    { key: 'status', header: 'Status', render: (g) => <Badge tone={g.status === 'active' ? 'success' : 'neutral'}>{g.status === 'active' ? 'Active' : 'Deactivated'}</Badge> },
    { key: 'assignments', header: 'Active families', render: (g) => g.activeAssignments, align: 'end' },
    { key: 'created', header: 'Since', render: (g) => formatDate(g.createdAt), hideOnMobile: true },
    {
      key: 'actions',
      header: 'Actions',
      align: 'end',
      render: (g) => (
        <Button size="sm" variant={g.status === 'active' ? 'ghost' : 'secondary'} onClick={() => (setError(undefined), setTarget(g))}>
          {g.status === 'active' ? 'Deactivate' : 'Reactivate'}
        </Button>
      ),
    },
  ];

  const activating = target?.status === 'deactivated';
  return (
    <>
      <DataTable
        caption="Genealogists"
        rows={genealogists}
        columns={columns}
        getRowId={(g) => g.id}
        getSearchText={(g) => `${g.displayName} ${g.email}`}
        searchLabel="Search genealogists"
        emptyTitle="No genealogists yet"
        emptyBody="Genealogist accounts are created by Kulvriksh; in local development use npm run dev:staff."
      />
      <Dialog
        open={Boolean(target)}
        onClose={() => setTarget(undefined)}
        title={activating ? 'Reactivate this genealogist?' : 'Deactivate this genealogist?'}
        description={
          target
            ? activating
              ? `${target.displayName} will be able to sign in again.`
              : `${target.displayName} will be signed out everywhere and cannot sign in or be assigned. Assignments are kept for history but give no access.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(undefined)}>
              Cancel
            </Button>
            <Button
              variant={activating ? 'primary' : 'danger'}
              disabled={pending}
              onClick={() =>
                target &&
                start(async () => {
                  const result = await setGenealogistStatusAction({ genealogistId: target.id, active: activating });
                  if (result.ok) {
                    notify(result.message);
                    setTarget(undefined);
                  } else {
                    setError(result.message);
                  }
                })
              }
            >
              {pending ? 'Saving…' : activating ? 'Reactivate' : 'Deactivate'}
            </Button>
          </>
        }
      >
        {error ? (
          <div role="alert">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : (
          <p>This change is recorded in the audit log.</p>
        )}
      </Dialog>
    </>
  );
}
