'use client';

import { useState, useTransition } from 'react';
import type { AdminWorkspaceView, GenealogistSummary, ReportView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextareaField } from '@/components/ui/form';
import { Card, EmptyState, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { assignAction, releaseReportAction, removeAssignmentAction, returnReportAction, type ActionResult } from '../actions';

// Real data: customer families, active genealogists, and reports waiting for review. A family has
// at most one active genealogist (R29 default); removing an assignment ends access at once.

function useAction() {
  const notify = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (action: () => Promise<ActionResult>, onDone?: () => void) =>
    start(async () => {
      const result = await action();
      if (result.ok) {
        setError(undefined);
        notify(result.message);
        onDone?.();
      } else {
        setError(result.message);
      }
    });
  return { pending, error, run, clear: () => setError(undefined) };
}

export function CasesAdmin({
  workspaces,
  genealogists,
  reports,
}: {
  workspaces: AdminWorkspaceView[];
  genealogists: GenealogistSummary[];
  reports: ReportView[];
}) {
  const assign = useAction();
  const review = useAction();
  const [assigning, setAssigning] = useState<{ workspace: AdminWorkspaceView; genealogistId: string }>();
  const [removing, setRemoving] = useState<AdminWorkspaceView>();
  const [reviewing, setReviewing] = useState<{ report: ReportView; reason: string }>();
  const active = genealogists.filter((g) => g.status === 'active');

  const columns: Column<AdminWorkspaceView>[] = [
    { key: 'name', header: 'Family', render: (w) => <span className={styles.cellTitle}>{w.name}</span>, sortValue: (w) => w.name },
    { key: 'owner', header: 'Customer', render: (w) => w.ownerMobileMasked, hideOnMobile: true },
    { key: 'members', header: 'People', render: (w) => w.memberCount, sortValue: (w) => w.memberCount, align: 'end' },
    {
      key: 'genealogist',
      header: 'Genealogist',
      render: (w) => (w.activeAssignment ? w.activeAssignment.genealogistName : <span className={styles.muted}>Unassigned</span>),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'end',
      render: (w) =>
        w.activeAssignment ? (
          <Button size="sm" variant="ghost" onClick={() => (assign.clear(), setRemoving(w))}>
            Remove assignment
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={active.length === 0} onClick={() => (assign.clear(), setAssigning({ workspace: w, genealogistId: active[0]?.id ?? '' }))}>
            Assign
          </Button>
        ),
    },
  ];

  return (
    <div className={styles.stack}>
      <Card title="Families" description="Assign a genealogist to a family. Only the assigned genealogist can see that family.">
        {workspaces.length === 0 ? (
          <EmptyState icon="users" title="No customer families yet">
            Families appear here once customers create their workspace.
          </EmptyState>
        ) : (
          <DataTable
            caption="Customer families"
            rows={workspaces}
            columns={columns}
            getRowId={(w) => w.id}
            getSearchText={(w) => `${w.name} ${w.activeAssignment?.genealogistName ?? ''}`}
            searchLabel="Search families"
          />
        )}
      </Card>

      <Card title="Reports awaiting review" description="Release makes a report visible to the family. Return sends it back with a reason.">
        {reports.length === 0 ? (
          <EmptyState icon="check" title="Nothing to review" />
        ) : (
          <ul className={styles.rowList} aria-label="Reports awaiting review">
            {reports.map((r) => (
              <li key={r.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>{r.title}</p>
                  <p className={styles.rowMeta}>
                    {r.workspaceName} · by {r.authorName}
                  </p>
                </div>
                <Button size="sm" onClick={() => (review.clear(), setReviewing({ report: r, reason: '' }))}>
                  Review
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={Boolean(assigning)}
        onClose={() => setAssigning(undefined)}
        title="Assign a genealogist"
        description={assigning ? `Family: ${assigning.workspace.name}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssigning(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={assign.pending || !assigning?.genealogistId}
              onClick={() =>
                assigning && assign.run(() => assignAction({ workspaceId: assigning.workspace.id, genealogistId: assigning.genealogistId }), () => setAssigning(undefined))
              }
            >
              {assign.pending ? 'Assigning…' : 'Assign'}
            </Button>
          </>
        }
      >
        {assigning ? (
          <SelectField
            id="assign-genealogist"
            label="Genealogist"
            options={active.map((g) => ({ value: g.id, label: `${g.displayName} (${g.activeAssignments} active)` }))}
            value={assigning.genealogistId}
            onChange={(e) => setAssigning({ ...assigning, genealogistId: e.target.value })}
          />
        ) : null}
        {assign.error ? (
          <div role="alert">
            <Notice tone="danger">{assign.error}</Notice>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(undefined)}
        title="Remove this assignment?"
        description={removing?.activeAssignment ? `${removing.activeAssignment.genealogistName} will lose access to ${removing.name} immediately. Their notes are kept.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={assign.pending}
              onClick={() =>
                removing?.activeAssignment && assign.run(() => removeAssignmentAction({ assignmentId: removing.activeAssignment!.id }), () => setRemoving(undefined))
              }
            >
              {assign.pending ? 'Removing…' : 'Remove assignment'}
            </Button>
          </>
        }
      >
        {assign.error ? (
          <div role="alert">
            <Notice tone="danger">{assign.error}</Notice>
          </div>
        ) : (
          <p>This cannot be undone, but you can assign a genealogist again.</p>
        )}
      </Dialog>

      <Dialog
        open={Boolean(reviewing)}
        onClose={() => setReviewing(undefined)}
        title={reviewing ? reviewing.report.title : 'Review report'}
        description={reviewing ? `${reviewing.report.workspaceName} · by ${reviewing.report.authorName}` : undefined}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={review.pending || !reviewing?.reason.trim()}
              onClick={() => reviewing && review.run(() => returnReportAction({ reportId: reviewing.report.id, reason: reviewing.reason }), () => setReviewing(undefined))}
            >
              Return for changes
            </Button>
            <Button
              disabled={review.pending}
              onClick={() => reviewing && review.run(() => releaseReportAction({ reportId: reviewing.report.id }), () => setReviewing(undefined))}
            >
              {review.pending ? 'Saving…' : 'Release to family'}
            </Button>
          </>
        }
      >
        {reviewing ? (
          <div className={styles.stack}>
            <p style={{ whiteSpace: 'pre-wrap', maxHeight: '40vh', overflow: 'auto' }}>{reviewing.report.body}</p>
            {reviewing.report.file ? (
              <p>
                <a href={`/api/files/staff/reports/${reviewing.report.id}`}>Download the attached PDF</a>
              </p>
            ) : null}
            <TextareaField
              id="return-reason"
              label="Reason for returning (needed only to return)"
              value={reviewing.reason}
              maxLength={1000}
              onChange={(e) => setReviewing({ ...reviewing, reason: e.target.value })}
            />
            {review.error ? (
              <div role="alert">
                <Notice tone="danger">{review.error}</Notice>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
