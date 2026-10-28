'use client';

import { useMemo, useState, useTransition } from 'react';
import type { FamilyMemberView, FamilyTreeView, RelationshipType, RelationshipView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormActions, SelectField, TextField } from '@/components/ui/form';
import { Badge, Card, EmptyState, Grid, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  addMemberAction,
  addRelationshipAction,
  createWorkspaceAction,
  deleteMemberAction,
  deleteRelationshipAction,
  renameMemberAction,
  renameWorkspaceAction,
  type ActionResult,
} from '../actions';

// The customer's real, persisted family workspace. Persisted fields are exactly: the family name,
// each person's name, and parent/spouse relationships (R17 and R18 decide more). Generations in
// the tree are computed from parent relationships, not stored.

const NAME_MAX = 120;
const TYPE_LABEL: Record<RelationshipType, string> = { parent_of: 'is a parent of', spouse_of: 'is the spouse of' };

/** Generation = longest chain of parents above a person (roots are generation 1). */
function generations(members: FamilyMemberView[], relationships: RelationshipView[]): Map<string, number> {
  const parents = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type === 'parent_of') {
      parents.set(r.toMemberId, [...(parents.get(r.toMemberId) ?? []), r.fromMemberId]);
    }
  }
  const memo = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    const cached = memo.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (seen.has(id)) {
      return 1; // the API prevents cycles; this only guards the view
    }
    seen.add(id);
    const value = 1 + Math.max(0, ...(parents.get(id) ?? []).map((p) => depth(p, seen)));
    memo.set(id, value);
    return value;
  };
  for (const m of members) {
    depth(m.id, new Set());
  }
  return memo;
}

function useAction() {
  const notify = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ActionResult & { ok: false }>();
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

function CreateWorkspace() {
  const [name, setName] = useState('');
  const { pending, error, run } = useAction();
  return (
    <Card title="Create your family workspace" description="A private place for your family tree. Only you can see it.">
      <form
        className={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          run(() => createWorkspaceAction({ name }));
        }}
      >
        <TextField
          id="workspace-name"
          label="Family name"
          placeholder="For example: The Mehta family"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          error={error?.fields?.name}
          required
        />
        {error && !error.fields ? <Notice tone="danger">{error.message}</Notice> : null}
        <FormActions>
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create workspace'}
          </Button>
        </FormActions>
      </form>
    </Card>
  );
}

export function FamilyManager({ tree }: { tree: FamilyTreeView | null }) {
  if (!tree) {
    return <CreateWorkspace />;
  }
  return <Workspace tree={tree} />;
}

function Workspace({ tree }: { tree: FamilyTreeView }) {
  const { members, relationships, workspace } = tree;
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const levels = useMemo(() => {
    const gen = generations(members, relationships);
    const groups = new Map<number, FamilyMemberView[]>();
    for (const m of members) {
      const g = gen.get(m.id) ?? 1;
      groups.set(g, [...(groups.get(g) ?? []), m]);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [members, relationships]);
  const spouses = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of relationships.filter((x) => x.type === 'spouse_of')) {
      map.set(r.fromMemberId, [...(map.get(r.fromMemberId) ?? []), r.toMemberId]);
      map.set(r.toMemberId, [...(map.get(r.toMemberId) ?? []), r.fromMemberId]);
    }
    return map;
  }, [relationships]);

  const add = useAction();
  const rel = useAction();
  const rename = useAction();
  const remove = useAction();
  const family = useAction();
  const [newName, setNewName] = useState('');
  const [link, setLink] = useState<{ from: string; type: RelationshipType; to: string }>({ from: '', type: 'parent_of', to: '' });
  const [editing, setEditing] = useState<{ member: FamilyMemberView; name: string }>();
  const [deleting, setDeleting] = useState<FamilyMemberView>();
  const [familyName, setFamilyName] = useState<string>();
  const options = [{ value: '', label: 'Choose a person' }, ...members.map((m) => ({ value: m.id, label: m.displayName }))];
  const name = (id: string) => byId.get(id)?.displayName ?? 'Unknown person';

  return (
    <div className={styles.stack}>
      <Notice tone="info" title="What is saved">
        Names and parent or spouse relationships are saved to your private workspace. Dates, places, photos and other details
        are not stored yet.
      </Notice>

      <Card
        title="Family tree"
        description={`${workspace.memberCount} people · ${workspace.relationshipCount} relationships (up to ${workspace.limits.maxMembers} people)`}
        action={
          <Button size="sm" variant="secondary" onClick={() => setFamilyName(workspace.name)}>
            Rename family
          </Button>
        }
      >
        {members.length === 0 ? (
          <EmptyState icon="tree" title="No one added yet">
            Add the people you know below, then connect them with relationships.
          </EmptyState>
        ) : (
          <div className={styles.tree} aria-label="Family tree by generation">
            {levels.map(([level, people]) => (
              <section key={level} className={styles.generation} aria-label={`Generation ${level}`}>
                <p className={styles.generationLabel}>Generation {level}</p>
                <ul className={styles.generationMembers}>
                  {people.map((person) => (
                    <li key={person.id} className={styles.person}>
                      <span className={styles.personName}>{person.displayName}</span>
                      {spouses.get(person.id)?.length ? (
                        <span className={styles.personMeta}>Spouse of {spouses.get(person.id)!.map(name).join(', ')}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Grid>
        <Card title="People">
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault();
              add.run(() => addMemberAction({ displayName: newName }), () => setNewName(''));
            }}
          >
            <TextField
              id="member-name"
              label="Add a person"
              placeholder="Full name"
              value={newName}
              maxLength={NAME_MAX}
              onChange={(e) => setNewName(e.target.value)}
              error={add.error?.fields?.displayName}
            />
            {add.error && !add.error.fields ? <Notice tone="danger">{add.error.message}</Notice> : null}
            <FormActions>
              <Button type="submit" icon="plus" disabled={add.pending || newName.trim() === ''}>
                {add.pending ? 'Adding…' : 'Add person'}
              </Button>
            </FormActions>
          </form>
          {members.length > 0 ? (
            <ul className={styles.rowList} aria-label="People in this family">
              {members.map((m) => (
                <li key={m.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>{m.displayName}</p>
                  </div>
                  <div className={styles.inlineActions}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ member: m, name: m.displayName })}>
                      Rename
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => (remove.clear(), setDeleting(m))}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card title="Relationships">
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault();
              rel.run(() => addRelationshipAction({ type: link.type, fromMemberId: link.from, toMemberId: link.to }), () =>
                setLink({ from: '', type: link.type, to: '' }),
              );
            }}
          >
            <SelectField id="rel-from" label="Person" options={options} value={link.from} onChange={(e) => setLink({ ...link, from: e.target.value })} />
            <SelectField
              id="rel-type"
              label="Relationship"
              options={[
                { value: 'parent_of', label: TYPE_LABEL.parent_of },
                { value: 'spouse_of', label: TYPE_LABEL.spouse_of },
              ]}
              value={link.type}
              onChange={(e) => setLink({ ...link, type: e.target.value as RelationshipType })}
            />
            <SelectField
              id="rel-to"
              label="Related person"
              options={options}
              value={link.to}
              onChange={(e) => setLink({ ...link, to: e.target.value })}
              error={rel.error?.fields?.toMemberId}
            />
            {rel.error && !rel.error.fields ? (
              <div role="alert">
                <Notice tone="danger">{rel.error.message}</Notice>
              </div>
            ) : null}
            <FormActions>
              <Button type="submit" disabled={rel.pending || !link.from || !link.to}>
                {rel.pending ? 'Saving…' : 'Add relationship'}
              </Button>
            </FormActions>
          </form>
          {relationships.length > 0 ? (
            <ul className={styles.rowList} aria-label="Relationships">
              {relationships.map((r) => (
                <li key={r.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>
                      {name(r.fromMemberId)} <Badge>{TYPE_LABEL[r.type]}</Badge> {name(r.toMemberId)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rel.pending}
                    onClick={() => rel.run(() => deleteRelationshipAction({ id: r.id }))}
                    aria-label={`Remove relationship between ${name(r.fromMemberId)} and ${name(r.toMemberId)}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </Grid>

      <Dialog
        open={Boolean(editing)}
        onClose={() => (rename.clear(), setEditing(undefined))}
        title="Rename person"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={rename.pending}
              onClick={() =>
                editing &&
                rename.run(() => renameMemberAction({ id: editing.member.id, displayName: editing.name, version: editing.member.version }), () =>
                  setEditing(undefined),
                )
              }
            >
              {rename.pending ? 'Saving…' : 'Save name'}
            </Button>
          </>
        }
      >
        {editing ? (
          <TextField
            id="rename-member"
            label="Name"
            value={editing.name}
            maxLength={NAME_MAX}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            error={rename.error?.fields?.displayName ?? (rename.error && !rename.error.fields ? rename.error.message : undefined)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title="Remove this person?"
        description={deleting ? `${deleting.displayName} will be removed from your family workspace.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={remove.pending}
              onClick={() => deleting && remove.run(() => deleteMemberAction({ id: deleting.id, version: deleting.version }), () => setDeleting(undefined))}
            >
              {remove.pending ? 'Removing…' : 'Remove person'}
            </Button>
          </>
        }
      >
        <p>People who still have relationships cannot be removed; remove their relationships first.</p>
        {remove.error ? (
          <div role="alert">
            <Notice tone="danger">{remove.error.message}</Notice>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={familyName !== undefined}
        onClose={() => setFamilyName(undefined)}
        title="Rename family"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFamilyName(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={family.pending}
              onClick={() => family.run(() => renameWorkspaceAction({ name: familyName ?? '' }), () => setFamilyName(undefined))}
            >
              {family.pending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <TextField
          id="family-name"
          label="Family name"
          value={familyName ?? ''}
          maxLength={NAME_MAX}
          onChange={(e) => setFamilyName(e.target.value)}
          error={family.error?.fields?.name ?? (family.error && !family.error.fields ? family.error.message : undefined)}
        />
      </Dialog>
    </div>
  );
}
