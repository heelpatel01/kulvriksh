'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import styles from '@/components/portal/portal-pages.module.css';
import { ActionMenu } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/form';
import { Card, Notice, ProgressBar, StatCard, StatGrid } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import type { SurnamePageRow } from '@/lib/repositories/admin';
import { PAGE_STATUS } from '@/lib/status';

type Errors = Partial<Record<'surname' | 'meta', string>>;

const STATUS_OPTIONS = Object.entries(PAGE_STATUS).map(([value, status]) => ({ value, label: status.label }));

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function SurnamePagesAdmin({ planned, initial }: { planned: number; initial: SurnamePageRow[] }) {
  const notify = useToast();
  const [pages, setPages] = useState<SurnamePageRow[]>(initial);
  const [editing, setEditing] = useState<SurnamePageRow | 'new' | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [meta, setMeta] = useState('');

  const published = pages.filter((page) => page.status === 'published').length;

  function open(page: SurnamePageRow | 'new') {
    setErrors({});
    setMeta(page === 'new' ? '' : page.metaDescription);
    setEditing(page);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const surname = String(data.get('surname') ?? '').trim();
    const status = String(data.get('status')) as SurnamePageRow['status'];
    const slug = editing === 'new' ? slugify(surname) : (editing?.slug ?? '');
    const next: Errors = {};
    if (surname.length < 2) {
      next.surname = 'Enter the surname.';
    } else if (editing === 'new' && pages.some((page) => page.slug === slug)) {
      next.surname = 'A page for this surname already exists.';
    }
    if (status !== 'awaiting_content' && (meta.trim().length < 50 || meta.trim().length > 160)) {
      next.meta = 'A meta description of 50–160 characters is needed before a page can be drafted or published.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }
    const row: SurnamePageRow = { slug, surname, status, metaDescription: meta.trim(), updatedAt: new Date().toISOString(), updatedLabel: 'Just now' };
    setPages((current) => (editing === 'new' ? [row, ...current] : current.map((page) => (page.slug === slug ? row : page))));
    setEditing(null);
    notify(`${surname} page saved in this preview; public pages are not regenerated`);
  }

  const columns: Column<SurnamePageRow>[] = [
    {
      key: 'surname',
      header: 'Surname',
      sortValue: (p) => p.surname,
      render: (p) => (
        <>
          <span className={styles.cellTitle}>{p.surname}</span>
          <span className={`${styles.cellMeta} ${styles.mono}`}>/surnames/{p.slug}</span>
        </>
      ),
    },
    {
      key: 'meta',
      header: 'Meta description',
      hideOnMobile: true,
      render: (p) => (p.metaDescription ? <span className={styles.muted}>{p.metaDescription}</span> : <span className={styles.muted}>Not written yet</span>),
    },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge map={PAGE_STATUS} value={p.status} /> },
    { key: 'updated', header: 'Updated', hideOnMobile: true, sortValue: (p) => p.updatedAt, render: (p) => p.updatedLabel },
    {
      key: 'actions',
      header: 'Actions',
      align: 'end',
      render: (p) => (
        <div className={styles.inlineActions} style={{ justifyContent: 'flex-end' }}>
          {p.status === 'published' && initial.some((page) => page.slug === p.slug && page.status === 'published') ? (
            <Link href={`/surnames/${p.slug}`} className={styles.muted}>
              View
            </Link>
          ) : null}
          <ActionMenu label={`Actions for ${p.surname}`} actions={[{ label: 'Edit page', onSelect: () => open(p) }]} />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.stack}>
      <StatGrid>
        <StatCard label="Pages created" value={`${pages.length} of ${planned}`} icon="globe" />
        <StatCard label="Published (preview)" value={published} icon="eye" />
        <StatCard label="Awaiting content" value={pages.filter((page) => page.status === 'awaiting_content').length} icon="file" />
      </StatGrid>
      <Card title="Progress towards the planned surname pages">
        <ProgressBar value={Math.round((pages.length / planned) * 100)} label="Surname pages created" />
      </Card>
      <Card>
        <DataTable
          caption="Surname pages"
          rows={pages}
          columns={columns}
          getRowId={(p) => p.slug}
          getSearchText={(p) => `${p.surname} ${p.slug}`}
          searchLabel="Search surnames"
          filters={[{ key: 'status', label: 'Status', options: STATUS_OPTIONS, getValue: (p) => p.status }]}
          toolbar={
            <Button size="sm" icon="plus" onClick={() => open('new')} disabled={pages.length >= planned}>
              Add surname page
            </Button>
          }
        />
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a surname page' : `Edit ${editing?.surname ?? ''}`}
        description="Page body content will come from the agreed content source (R2)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="surname-form">
              Save page
            </Button>
          </>
        }
      >
        <form id="surname-form" className={styles.stack} onSubmit={save} noValidate key={editing === 'new' ? 'new' : (editing?.slug ?? 'none')}>
          <TextField
            id="surname-name"
            name="surname"
            label="Surname"
            required
            defaultValue={editing && editing !== 'new' ? editing.surname : undefined}
            readOnly={editing !== 'new'}
            hint={editing === 'new' ? 'The page address is created from the surname.' : `Address: /surnames/${editing?.slug ?? ''}`}
            error={errors.surname}
          />
          <TextareaField
            id="surname-meta"
            name="meta"
            label="Meta description"
            value={meta}
            onChange={(event) => setMeta(event.target.value)}
            hint={`${meta.trim().length} characters (50–160 recommended for search results)`}
            error={errors.meta}
          />
          <SelectField
            id="surname-status"
            name="status"
            label="Status"
            options={STATUS_OPTIONS}
            defaultValue={editing && editing !== 'new' ? editing.status : 'awaiting_content'}
          />
          <Notice tone="info">Publishing here does not change the public site in this preview.</Notice>
        </form>
      </Dialog>
    </div>
  );
}
