'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ReportView, ResearchRecordKind, ResearchRecordView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormActions, SelectField, TextareaField, TextField } from '@/components/ui/form';
import { Badge, Card, EmptyState, Grid, Notice } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import type { CaseDetail } from '@/lib/api/portal';
import {
  addRecordAction,
  createReportAction,
  saveReportAction,
  submitReportAction,
  updateRecordAction,
  type ActionResult,
} from '../../actions';

// Real data for one assigned family. Members and relationships are read-only for genealogists
// (R30 undecided). Records and reports are saved through the API, which re-checks the assignment.

const REPORT_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted for review', tone: 'info' },
  returned: { label: 'Returned for changes', tone: 'warning' },
  released: { label: 'Released to the family', tone: 'success' },
} as const;

function useAction() {
  const notify = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { ok: false }>>();
  const run = (action: () => Promise<ActionResult>, onDone?: () => void) =>
    start(async () => {
      const result = await action();
      if (result.ok) {
        setError(undefined);
        notify(result.message);
        onDone?.();
      } else {
        setError(result);
      }
    });
  return { pending, error, run, clear: () => setError(undefined) };
}

const ErrorNotice = ({ error }: { error?: { message: string; fields?: Record<string, string> } }) =>
  error && !error.fields ? (
    <div role="alert">
      <Notice tone="danger">{error.message}</Notice>
    </div>
  ) : null;

/** Attaches (or replaces) the report's PDF while it is a draft or returned. */
function ReportFileUpload({ workspaceId, reportId, hasFile }: { workspaceId: string; reportId: string; hasFile: boolean }) {
  const router = useRouter();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className={styles.inlineActions} style={{ cursor: 'pointer' }}>
      <span>{busy ? 'Uploading…' : hasFile ? 'Replace PDF' : 'Attach PDF'}</span>
      <input
        type="file"
        accept="application/pdf"
        className="visually-hidden"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) {
            return;
          }
          setBusy(true);
          const res = await fetch(`/api/files/staff/cases/${workspaceId}/reports/${reportId}`, {
            method: 'POST',
            body: file,
            headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) },
          }).catch(() => undefined);
          setBusy(false);
          e.target.value = '';
          if (res?.ok) {
            notify('PDF attached.');
            router.refresh();
          } else {
            const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
            notify(body?.error?.message ?? 'The PDF could not be attached.', 'warning');
          }
        }}
      />
    </label>
  );
}

export function CaseWorkspace({ detail, records, reports }: { detail: CaseDetail; records: ResearchRecordView[]; reports: ReportView[] }) {
  const ws = detail.workspaceId;
  const name = (id: string) => detail.members.find((m) => m.id === id)?.displayName ?? 'Unknown person';

  const addRecord = useAction();
  const editRecord = useAction();
  const newReport = useAction();
  const report = useAction();
  const [draft, setDraft] = useState<{ kind: ResearchRecordKind; body: string }>({ kind: 'note', body: '' });
  const [editingRecord, setEditingRecord] = useState<{ record: ResearchRecordView; body: string }>();
  const [reportTitle, setReportTitle] = useState('');
  const [editingReport, setEditingReport] = useState<{ report: ReportView; title: string; body: string }>();

  return (
    <div className={styles.stack}>
      <Grid>
        <Card title="Family members" description="Read-only. Customer contact details and media are not shared with genealogists.">
          {detail.members.length === 0 ? (
            <EmptyState icon="users" title="No people recorded yet" />
          ) : (
            <ul className={styles.rowList}>
              {detail.members.map((m) => (
                <li key={m.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>{m.displayName}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Relationships">
          {detail.relationships.length === 0 ? (
            <EmptyState icon="tree" title="No relationships recorded yet" />
          ) : (
            <ul className={styles.rowList}>
              {detail.relationships.map((r) => (
                <li key={r.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>
                      {name(r.fromMemberId)} <Badge>{r.type === 'parent_of' ? 'parent of' : 'spouse of'}</Badge> {name(r.toMemberId)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Grid>

      <Card title="Research notes and sources" description="Visible to you and the Kulvriksh team, never to the family.">
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            addRecord.run(() => addRecordAction({ workspaceId: ws, ...draft }), () => setDraft({ kind: draft.kind, body: '' }));
          }}
        >
          <SelectField
            id="record-kind"
            label="Type"
            options={[
              { value: 'note', label: 'Note' },
              { value: 'source', label: 'Source reference' },
            ]}
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as ResearchRecordKind })}
          />
          <TextareaField
            id="record-body"
            label={draft.kind === 'source' ? 'Source (register, archive, document…)' : 'Note'}
            value={draft.body}
            maxLength={5000}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            error={addRecord.error?.fields?.body}
          />
          <ErrorNotice error={addRecord.error} />
          <FormActions>
            <Button type="submit" disabled={addRecord.pending || draft.body.trim() === ''}>
              {addRecord.pending ? 'Saving…' : 'Save record'}
            </Button>
          </FormActions>
        </form>
        {records.length > 0 ? (
          <ul className={styles.noteList} aria-label="Research records">
            {records.map((r) => (
              <li key={r.id} className={styles.note}>
                <div className={styles.noteHead}>
                  <Badge tone={r.kind === 'source' ? 'accent' : 'neutral'}>{r.kind === 'source' ? 'Source' : 'Note'}</Badge>
                  <span className={styles.muted}>
                    {r.authorName} · {new Date(r.updatedAt).toLocaleDateString('en-IN')}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => (editRecord.clear(), setEditingRecord({ record: r, body: r.body }))}>
                    Edit
                  </Button>
                </div>
                <p className={styles.noteBody} style={{ whiteSpace: 'pre-wrap' }}>
                  {r.body}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="Reports" description="Draft, then submit for review. The family sees a report only after an administrator releases it.">
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            newReport.run(() => createReportAction({ workspaceId: ws, title: reportTitle }), () => setReportTitle(''));
          }}
        >
          <TextField
            id="report-title"
            label="New report title"
            value={reportTitle}
            maxLength={200}
            onChange={(e) => setReportTitle(e.target.value)}
            error={newReport.error?.fields?.title}
          />
          <ErrorNotice error={newReport.error} />
          <FormActions>
            <Button type="submit" variant="secondary" disabled={newReport.pending || reportTitle.trim() === ''}>
              Create draft
            </Button>
          </FormActions>
        </form>
        <ErrorNotice error={report.error} />
        {reports.length > 0 ? (
          <ul className={styles.rowList} aria-label="Reports">
            {reports.map((r) => {
              const editable = r.status === 'draft' || r.status === 'returned';
              return (
                <li key={r.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>{r.title}</p>
                    {r.status === 'returned' && r.returnReason ? <p className={styles.rowMeta}>Reviewer: {r.returnReason}</p> : null}
                  </div>
                  <div className={styles.inlineActions}>
                    <StatusBadge map={REPORT_STATUS} value={r.status} />
                    {editable ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => (report.clear(), setEditingReport({ report: r, title: r.title, body: r.body }))}>
                          Edit
                        </Button>
                        <ReportFileUpload workspaceId={ws} reportId={r.id} hasFile={Boolean(r.file)} />
                        <Button size="sm" disabled={report.pending} onClick={() => report.run(() => submitReportAction({ workspaceId: ws, id: r.id }))}>
                          Submit for review
                        </Button>
                      </>
                    ) : null}
                    {r.file ? (
                      <a href={`/api/files/staff/cases/${ws}/reports/${r.id}`} aria-label={`Download the PDF of ${r.title}`}>
                        PDF
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>

      <Dialog
        open={Boolean(editingRecord)}
        onClose={() => setEditingRecord(undefined)}
        title="Edit record"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingRecord(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={editRecord.pending}
              onClick={() =>
                editingRecord &&
                editRecord.run(
                  () => updateRecordAction({ workspaceId: ws, id: editingRecord.record.id, body: editingRecord.body, version: editingRecord.record.version }),
                  () => setEditingRecord(undefined),
                )
              }
            >
              {editRecord.pending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        {editingRecord ? (
          <>
            <TextareaField
              id="edit-record-body"
              label="Text"
              value={editingRecord.body}
              maxLength={5000}
              onChange={(e) => setEditingRecord({ ...editingRecord, body: e.target.value })}
              error={editRecord.error?.fields?.body}
            />
            <ErrorNotice error={editRecord.error} />
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(editingReport)}
        onClose={() => setEditingReport(undefined)}
        title="Edit report"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingReport(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={report.pending}
              onClick={() =>
                editingReport &&
                report.run(
                  () =>
                    saveReportAction({
                      workspaceId: ws,
                      id: editingReport.report.id,
                      title: editingReport.title,
                      body: editingReport.body,
                      version: editingReport.report.version,
                    }),
                  () => setEditingReport(undefined),
                )
              }
            >
              {report.pending ? 'Saving…' : 'Save draft'}
            </Button>
          </>
        }
      >
        {editingReport ? (
          <>
            <TextField
              id="edit-report-title"
              label="Title"
              value={editingReport.title}
              maxLength={200}
              onChange={(e) => setEditingReport({ ...editingReport, title: e.target.value })}
              error={report.error?.fields?.title}
            />
            <TextareaField
              id="edit-report-body"
              label="Report"
              value={editingReport.body}
              maxLength={20000}
              rows={12}
              onChange={(e) => setEditingReport({ ...editingReport, body: e.target.value })}
              error={report.error?.fields?.body}
            />
            <ErrorNotice error={report.error} />
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
