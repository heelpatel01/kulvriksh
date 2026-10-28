'use client';

import { useState, useTransition } from 'react';
import type { StaffAccountView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FormActions, FormGrid, SelectField, TextField } from '@/components/ui/form';
import { Badge, Card, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { createStaffAction, issueStaffLinkAction, resetStaffMfaAction, setStaffStatusAction, type LinkActionResult } from '../actions';

// Real staff accounts. New accounts have no password: the person sets one with the one-time link
// shown here once. No email provider exists yet (R37), so the admin passes the link on.
export function StaffAdmin({ staff, selfId, adminsMayManageAdmins }: { staff: StaffAccountView[]; selfId: string; adminsMayManageAdmins: boolean }) {
  const notify = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<{ email: string; displayName: string; role: 'genealogist' | 'admin' }>({ email: '', displayName: '', role: 'genealogist' });
  const [result, setResult] = useState<LinkActionResult>();
  const [link, setLink] = useState<{ token: string; expiresAt: string; who: string }>();

  const run = (action: () => Promise<LinkActionResult>, who: string, onOk?: () => void) =>
    start(async () => {
      const r = await action();
      setResult(r);
      if (r.ok) {
        notify(r.message);
        setLink(r.link ? { ...r.link, who } : undefined);
        onOk?.();
      }
    });

  const manageable = (s: StaffAccountView) => s.id !== selfId && (s.role === 'genealogist' || adminsMayManageAdmins);
  const columns: Column<StaffAccountView>[] = [
    { key: 'name', header: 'Name', render: (s) => <span className={styles.cellTitle}>{s.displayName}</span>, sortValue: (s) => s.displayName },
    { key: 'email', header: 'Email', render: (s) => s.email, hideOnMobile: true },
    { key: 'role', header: 'Role', render: (s) => (s.role === 'admin' ? 'Administrator' : 'Genealogist') },
    {
      key: 'state',
      header: 'State',
      render: (s) => (
        <span className={styles.inlineActions}>
          <Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status === 'active' ? 'Active' : 'Deactivated'}</Badge>
          {!s.passwordSet ? <Badge tone="warning">Setup pending</Badge> : null}
          {s.mfaEnabled ? <Badge tone="info">2-step</Badge> : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'end',
      render: (s) =>
        manageable(s) ? (
          <span className={styles.inlineActions}>
            {s.status === 'active' ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => issueStaffLinkAction({ userId: s.id }), s.displayName)}>
                {s.passwordSet ? 'Reset password' : 'New setup link'}
              </Button>
            ) : null}
            {s.mfaEnabled ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resetStaffMfaAction({ userId: s.id }), s.displayName)}>
                Reset 2-step
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setStaffStatusAction({ userId: s.id, active: s.status !== 'active' }), s.displayName)}>
              {s.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </Button>
          </span>
        ) : (
          <span className={styles.muted}>{s.id === selfId ? 'You' : 'Admin (R33)'}</span>
        ),
    },
  ];

  const error = result && !result.ok ? result : undefined;
  return (
    <div className={styles.stack}>
      {link ? (
        <Notice tone="warning" title={`One-time link for ${link.who} — copy it now, it is not shown again`}>
          <code data-staff-link style={{ wordBreak: 'break-all' }}>{`${window.location.origin}/staff/setup#token=${link.token}`}</code>
          <br />
          Valid until {new Date(link.expiresAt).toLocaleString('en-IN')}. Send it through a trusted channel.
        </Notice>
      ) : null}
      {error ? (
        <div role="alert">
          <Notice tone="danger">{error.message}</Notice>
        </div>
      ) : null}
      <Card title="Add a staff member" description={adminsMayManageAdmins ? 'Genealogists and administrators.' : 'Genealogists. Administrators are created with the bootstrap command until R33 is decided.'}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createStaffAction(form), form.displayName, () => setForm({ email: '', displayName: '', role: 'genealogist' }));
          }}
        >
          <FormGrid>
            <TextField id="staff-new-name" label="Name" value={form.displayName} maxLength={120} onChange={(e) => setForm({ ...form, displayName: e.target.value })} error={error?.fields?.displayName} />
            <TextField id="staff-new-email" label="Work email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={error?.fields?.email} />
            <SelectField
              id="staff-new-role"
              label="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'genealogist' | 'admin' })}
              options={[{ value: 'genealogist', label: 'Genealogist' }, ...(adminsMayManageAdmins ? [{ value: 'admin', label: 'Administrator' }] : [])]}
            />
          </FormGrid>
          <FormActions>
            <Button type="submit" disabled={pending || !form.email || !form.displayName}>
              {pending ? 'Saving…' : 'Create account'}
            </Button>
          </FormActions>
        </form>
      </Card>
      <Card>
        <DataTable caption="Staff accounts" rows={staff} columns={columns} getRowId={(s) => s.id} getSearchText={(s) => `${s.displayName} ${s.email}`} searchLabel="Search staff" />
      </Card>
    </div>
  );
}
