'use client';

import { useState, useTransition, type FormEvent } from 'react';
import styles from '@/components/portal/portal-pages.module.css';
import { ActionMenu } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/form';
import { Badge, Card, EmptyState, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import type { AdminService, ServiceStatus } from '@/lib/api/services';
import { createServiceAction, updateServiceAction, type ActionResult } from './actions';

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

function StatusBadge({ status }: { status: ServiceStatus }) {
  return status === 'active' ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>;
}

export function ServicesAdmin({ services }: { services: AdminService[] }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<AdminService | 'new' | null>(null);
  const [toggling, setToggling] = useState<AdminService | null>(null);
  const [result, setResult] = useState<Extract<ActionResult, { ok: false }> | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function openForm(service: AdminService | 'new') {
    setResult(null);
    setName(service === 'new' ? '' : service.name);
    setDescription(service === 'new' ? '' : service.description);
    setEditing(service);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const status = String(new FormData(event.currentTarget).get('status')) as ServiceStatus;
    startTransition(async () => {
      const outcome =
        editing === 'new'
          ? await createServiceAction({ name, description, status })
          : editing
            ? await updateServiceAction(editing.id, { name, description, status })
            : null;
      if (!outcome) {
        return;
      }
      if (outcome.ok) {
        setEditing(null);
        notify(outcome.message);
      } else {
        setResult(outcome);
      }
    });
  }

  function confirmToggle() {
    if (!toggling) {
      return;
    }
    const target = toggling;
    startTransition(async () => {
      const outcome = await updateServiceAction(target.id, { status: target.status === 'active' ? 'inactive' : 'active' });
      setToggling(null);
      notify(outcome.message, outcome.ok ? 'success' : 'warning');
    });
  }

  const columns: Column<AdminService>[] = [
    {
      key: 'name',
      header: 'Service',
      sortValue: (s) => s.name.toLowerCase(),
      render: (s) => (
        <>
          <span className={styles.cellTitle}>{s.name}</span>
          <span className={styles.cellMeta}>{s.description.length > 90 ? `${s.description.slice(0, 90)}…` : s.description}</span>
        </>
      ),
    },
    { key: 'status', header: 'Status', sortValue: (s) => s.status, render: (s) => <StatusBadge status={s.status} /> },
    { key: 'updated', header: 'Updated', hideOnMobile: true, sortValue: (s) => s.updatedAt, render: (s) => dateFormat.format(new Date(s.updatedAt)) },
    {
      key: 'actions',
      header: 'Actions',
      align: 'end',
      render: (s) => (
        <ActionMenu
          label={`Actions for ${s.name}`}
          actions={[
            { label: 'Edit', onSelect: () => openForm(s) },
            { label: s.status === 'active' ? 'Deactivate' : 'Activate', onSelect: () => setToggling(s), tone: s.status === 'active' ? 'danger' : undefined },
          ]}
        />
      ),
    },
  ];

  return (
    <div className={styles.stack}>
      <Notice tone="info" title="Saved and audited">
        Changes are saved to the database with your admin account and recorded in the audit log.
      </Notice>
      <Card>
        {services.length === 0 ? (
          <EmptyState
            icon="layers"
            title="No services yet"
            action={
              <Button icon="plus" onClick={() => openForm('new')}>
                Add the first service
              </Button>
            }
          >
            Services you add are stored in the database and stay inactive until you activate them.
          </EmptyState>
        ) : (
          <DataTable
            caption="Services"
            rows={services}
            columns={columns}
            getRowId={(s) => s.id}
            getSearchText={(s) => `${s.name} ${s.description}`}
            searchLabel="Search services"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ],
                getValue: (s) => s.status,
              },
            ]}
            initialSort={{ key: 'name', direction: 'asc' }}
            toolbar={
              <Button size="sm" icon="plus" onClick={() => openForm('new')}>
                Add service
              </Button>
            }
          />
        )}
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a service' : `Edit ${editing?.name ?? ''}`}
        description="Descriptive fields are provisional until the service definitions are agreed (R12)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="service-form" disabled={pending}>
              {pending ? 'Saving…' : 'Save service'}
            </Button>
          </>
        }
      >
        <form id="service-form" className={styles.stack} onSubmit={submit} noValidate key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}>
          {result ? <Notice tone="danger">{result.message}</Notice> : null}
          <TextField
            id="service-name"
            name="name"
            label="Name"
            required
            maxLength={NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            hint={`${name.trim().length} of ${NAME_MAX} characters`}
            error={result?.fields?.name}
          />
          <TextareaField
            id="service-description"
            name="description"
            label="Description"
            required
            maxLength={DESCRIPTION_MAX}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            hint={`${description.trim().length} of ${DESCRIPTION_MAX} characters`}
            error={result?.fields?.description}
          />
          <SelectField
            id="service-status"
            name="status"
            label="Status"
            defaultValue={editing && editing !== 'new' ? editing.status : 'inactive'}
            hint="Only active services are shown publicly."
            options={[
              { value: 'inactive', label: 'Inactive' },
              { value: 'active', label: 'Active' },
            ]}
            error={result?.fields?.status}
          />
        </form>
      </Dialog>

      <Dialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        title={toggling?.status === 'active' ? `Deactivate “${toggling.name}”?` : `Activate “${toggling?.name ?? ''}”?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToggling(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant={toggling?.status === 'active' ? 'danger' : 'primary'} onClick={confirmToggle} disabled={pending}>
              {pending ? 'Saving…' : toggling?.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
          </>
        }
      >
        <p className={styles.muted}>
          {toggling?.status === 'active'
            ? 'It will no longer be shown publicly. Existing records that refer to it are not affected.'
            : 'It will be shown publicly with its name and description.'}
        </p>
      </Dialog>
    </div>
  );
}
