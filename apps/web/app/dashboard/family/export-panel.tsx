'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { ExportJobView, ExportOptionsView, ExportPreviewView, FamilyMemberView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button, ButtonAnchor } from '@/components/ui/button';
import { FormActions, FormGrid, SelectField, TextField, Toggle } from '@/components/ui/form';
import { Badge, Card, DetailList, Notice, ProgressBar } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatBytes, formatDateTime } from '@/lib/format';
import { cancelExportAction, getExportAction, previewExportAction, requestExportAction } from './export-actions';

// Family tree PDF export. The PDF is generated on the server, in a background worker; this page
// asks for it, shows an estimate of what the chosen options will produce (computed by the API
// from the real layout, not guessed here), checks the job's progress at a gentle, bounded pace
// and offers the download when it is ready. Every download is checked again by the API.
//
// The form starts from the options of the customer's own most recent export (kept by the API with
// the job), so nothing about the family is stored in the browser.

type Mode = ExportOptionsView['mode'];
type ScopeKind = 'all' | 'descendants' | 'ancestors';
type SheetChoice = 'scale' | 'count';

const MODES: ReadonlyArray<{ value: Mode; label: string; hint: string }> = [
  {
    value: 'single',
    label: 'One page',
    hint: 'The whole tree shrunk to fit one sheet of the size you choose. Quick to print, but names get smaller as the family grows; check the printed name size below.',
  },
  {
    value: 'poster',
    label: 'Poster',
    hint: 'One large page sized to the tree, for a print shop or a plotter. Names keep their size; the page grows instead (up to 200 × 200 inches).',
  },
  {
    value: 'tiled',
    label: 'Printable sheets',
    hint: 'The tree at one constant size, split over ordinary sheets you print at home and join. Includes an assembly page, sheet numbers and alignment marks.',
  },
];

const PAGE_SIZES = ['A4', 'A3', 'A2', 'A1', 'A0', 'Letter', 'Legal', 'Tabloid', 'custom'] as const;

const WARNINGS: Record<string, string> = {
  labels_small: 'Names will be small (under 6 pt). Readable up close, but a larger page, a poster or printable sheets will be easier to read.',
  labels_unreadable: 'Names will be too small to read (under 3.5 pt). Use a poster or printable sheets instead.',
  labels_truncated: 'Some very long names are shortened in their boxes; the index lists them in full.',
  poster_reduced: 'The tree is scaled down to fit the largest page PDF viewers support (200 × 200 inches).',
  unsupported_characters:
    'Some characters in names are in a script the PDF cannot show yet; they print as an empty box. Gujarati, Devanagari (Hindi, Marathi…) and Latin scripts are supported.',
  spouses_across_generations: 'Some spouses are in different generations and are joined with a dashed line.',
  target_sheets_unreachable: 'The tree cannot fit on that many sheets even at the smallest scale (25%). The estimate shows the fewest sheets possible.',
  too_many_pages: 'This needs more pages than allowed. Choose a smaller scale, fewer sheets, a larger sheet size or part of the tree.',
};

const ERRORS: Record<string, string> = {
  too_many_pages: 'This export would need too many pages. Choose a smaller scale, fewer sheets or a larger sheet size.',
  timeout: 'The export took too long and was stopped. Try a smaller scale, or a part of the tree.',
  out_of_memory: 'The export was too large to prepare. Try a part of the tree.',
  cancelled: 'You cancelled this export.',
  interrupted: 'The export was interrupted by a server restart.',
  scope_not_found: 'The chosen person is no longer in the tree.',
  too_large: 'The PDF would be larger than allowed. Try a part of the tree.',
  generation_failed: 'The PDF could not be created.',
  storage_failed: 'The PDF could not be saved.',
};

const STATUS: Record<ExportJobView['status'], { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' }> = {
  queued: { label: 'Waiting', tone: 'neutral' },
  running: { label: 'Preparing', tone: 'info' },
  ready: { label: 'Ready', tone: 'success' },
  failed: { label: 'Not created', tone: 'danger' },
};

const MODE_LABEL: Record<Mode, string> = { single: 'One page', poster: 'Poster', tiled: 'Printable sheets' };
const open = (job: ExportJobView) => job.status === 'queued' || job.status === 'running';

/** Plain-language readability of a printed name size. */
function readability(pt: number): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (pt >= 6) {
    return { label: 'easy to read', tone: 'success' };
  }
  if (pt >= 3.5) {
    return { label: 'small', tone: 'warning' };
  }
  return { label: 'too small to read', tone: 'danger' };
}

/** Polls one job until it finishes: every second at first, slowing to every 5 seconds; at most 15 minutes. */
function usePolling(job: ExportJobView | undefined, onUpdate: (job: ExportJobView) => void) {
  const update = useRef(onUpdate);
  useEffect(() => {
    update.current = onUpdate;
  });
  const id = job && open(job) ? job.id : undefined;
  useEffect(() => {
    if (!id) {
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    let delay = 1000;
    const tick = async () => {
      const result = await getExportAction(id);
      if (stopped) {
        return;
      }
      if (result.ok) {
        update.current(result.job);
        if (!open(result.job)) {
          return;
        }
      }
      if (Date.now() - started < 15 * 60_000) {
        delay = Math.min(5000, delay * 1.3);
        timer = setTimeout(tick, delay);
      }
    };
    timer = setTimeout(tick, delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);
}

/**
 * The API's estimate for the current options, refreshed shortly after they stop changing.
 * `tree` is the server-rendered member list: every family edit re-renders the page with a new
 * array, so people or relationships added after the last estimate refresh it too.
 */
function usePreview(options: ExportOptionsView, enabled: boolean, tree: unknown) {
  const [state, setState] = useState<{ key: string; tree?: unknown; preview?: ExportPreviewView; error?: string }>({ key: '' });
  const key = JSON.stringify(options);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let stopped = false;
    const timer = setTimeout(async () => {
      const result = await previewExportAction(JSON.parse(key) as ExportOptionsView);
      if (!stopped) {
        setState(result.ok ? { key, tree, preview: result.preview } : { key, tree, error: result.message });
      }
    }, 600);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [key, enabled, tree]);
  return { ...state, current: state.key === key && state.tree === tree };
}

export function ExportPanel({ members, initialJobs }: { members: FamilyMemberView[]; initialJobs: ExportJobView[] }) {
  const notify = useToast();
  const [jobs, setJobs] = useState(initialJobs);
  // Start from the customer's own last export; a subtree person who was removed falls back to the whole tree.
  const last = initialJobs[0]?.options;
  const lastScope = last && last.scope.kind !== 'all' && members.some((m) => m.id === (last.scope as { memberId: string }).memberId) ? last.scope : undefined;
  const [mode, setMode] = useState<Mode>(last?.mode ?? 'single');
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(last?.pageSize ?? 'A4');
  const [customW, setCustomW] = useState(String(last?.customWidthMm ?? 600));
  const [customH, setCustomH] = useState(String(last?.customHeightMm ?? 900));
  const [orientation, setOrientation] = useState<ExportOptionsView['orientation']>(last?.orientation ?? 'auto');
  const [labelSize, setLabelSize] = useState(String(last?.labelSize ?? 9));
  const [scale, setScale] = useState(String(last?.scalePercent ?? 100));
  const [sheetChoice, setSheetChoice] = useState<SheetChoice>(last?.targetSheets ? 'count' : 'scale');
  const [targetSheets, setTargetSheets] = useState(String(last?.targetSheets ?? 4));
  const [showNumbers, setShowNumbers] = useState(last?.showNumbers ?? true);
  const [showGeneration, setShowGeneration] = useState(last?.showGeneration ?? false);
  const [includeIndex, setIncludeIndex] = useState(last?.includeIndex ?? true);
  const [scopeKind, setScopeKind] = useState<ScopeKind>(lastScope?.kind ?? 'all');
  const [scopeMember, setScopeMember] = useState(lastScope && 'memberId' in lastScope ? lastScope.memberId : (members[0]?.id ?? ''));
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> }>();
  const [pending, start] = useTransition();

  const current = jobs[0];
  const upsert = (job: ExportJobView) => setJobs((list) => [job, ...list.filter((j) => j.id !== job.id)].slice(0, 5));
  usePolling(current, upsert);

  const options = useMemo((): ExportOptionsView => {
    const tiledByCount = mode === 'tiled' && sheetChoice === 'count';
    return {
      mode,
      pageSize: mode === 'poster' && pageSize === 'custom' ? 'A4' : pageSize,
      ...(pageSize === 'custom' && mode !== 'poster' ? { customWidthMm: Number(customW), customHeightMm: Number(customH) } : {}),
      orientation,
      labelSize: Number(labelSize),
      scalePercent: Number(scale),
      ...(tiledByCount ? { targetSheets: Number(targetSheets) } : {}),
      showNumbers,
      showGeneration,
      includeIndex,
      scope: scopeKind === 'all' ? { kind: 'all' } : { kind: scopeKind, memberId: scopeMember },
    };
  }, [mode, pageSize, customW, customH, orientation, labelSize, scale, sheetChoice, targetSheets, showNumbers, showGeneration, includeIndex, scopeKind, scopeMember]);

  const estimate = usePreview(options, members.length > 0, members);

  const request = (opts: ExportOptionsView) =>
    start(async () => {
      setError(undefined);
      const result = await requestExportAction(opts);
      if (result.ok) {
        upsert(result.job);
        notify(open(result.job) ? 'Your PDF is being prepared.' : 'Export updated.');
      } else {
        setError(result);
      }
    });

  const cancel = (job: ExportJobView) =>
    start(async () => {
      const result = await cancelExportAction(job.id);
      notify(result.message);
      const fresh = await getExportAction(job.id);
      if (fresh.ok) {
        upsert(fresh.job);
      }
    });

  const busy = pending || (current !== undefined && open(current));
  const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName }));
  const preview = estimate.preview;
  const read = preview ? readability(preview.effectiveLabelPt) : undefined;
  const overLimit = preview && !preview.withinLimits;

  return (
    <Card
      title="Download as PDF"
      description="A printable family tree with every person and relationship, in Gujarati, Devanagari and Latin script. The PDF is prepared on our server and kept for you to download for a limited time."
    >
      <form
        className={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          request(options);
        }}
      >
        <FormGrid>
          <SelectField
            id="export-mode"
            label="Layout"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            options={MODES.map((m) => ({ value: m.value, label: m.label }))}
            hint={MODES.find((m) => m.value === mode)?.hint}
          />
          {mode !== 'poster' ? (
            <SelectField
              id="export-page"
              label={mode === 'tiled' ? 'Sheet size' : 'Page size'}
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as (typeof PAGE_SIZES)[number])}
              options={PAGE_SIZES.map((p) => ({ value: p, label: p === 'custom' ? 'Custom size' : p }))}
              error={error?.fields?.pageSize}
            />
          ) : null}
          {mode !== 'poster' && pageSize === 'custom' ? (
            <>
              <TextField id="export-w" label="Width (mm)" type="number" min={100} max={5000} value={customW} onChange={(e) => setCustomW(e.target.value)} error={error?.fields?.customWidthMm} />
              <TextField id="export-h" label="Height (mm)" type="number" min={100} max={5000} value={customH} onChange={(e) => setCustomH(e.target.value)} error={error?.fields?.customHeightMm} />
            </>
          ) : null}
          {mode !== 'poster' ? (
            <SelectField
              id="export-orientation"
              label="Orientation"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as ExportOptionsView['orientation'])}
              options={[
                { value: 'auto', label: mode === 'tiled' ? 'Fewest sheets' : 'Best fit' },
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
            />
          ) : null}
          <TextField
            id="export-label"
            label="Name size (pt)"
            type="number"
            min={5}
            max={24}
            step={0.5}
            value={labelSize}
            onChange={(e) => setLabelSize(e.target.value)}
            hint={mode === 'single' ? 'The size names would have at 100%; one page then shrinks everything to fit.' : 'Printed size of names at 100%. 9 pt is like a book’s small print.'}
            error={error?.fields?.labelSize}
          />
          {mode === 'tiled' ? (
            <SelectField
              id="export-sheet-choice"
              label="Size the tree by"
              value={sheetChoice}
              onChange={(e) => setSheetChoice(e.target.value as SheetChoice)}
              options={[
                { value: 'scale', label: 'Scale' },
                { value: 'count', label: 'Number of sheets' },
              ]}
              hint="More sheets means bigger, easier-to-read names; fewer sheets means smaller names."
            />
          ) : null}
          {mode === 'tiled' && sheetChoice === 'count' ? (
            <TextField
              id="export-target"
              label="At most this many sheets"
              type="number"
              min={1}
              max={300}
              value={targetSheets}
              onChange={(e) => setTargetSheets(e.target.value)}
              hint="We use the largest scale that fits."
              error={error?.fields?.targetSheets}
            />
          ) : null}
          {mode === 'poster' || (mode === 'tiled' && sheetChoice === 'scale') ? (
            <TextField
              id="export-scale"
              label="Scale (%)"
              type="number"
              min={25}
              max={400}
              step={5}
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              hint={mode === 'tiled' ? 'Lower means fewer sheets and smaller names.' : 'Lower means a smaller poster and smaller names.'}
              error={error?.fields?.scalePercent}
            />
          ) : null}
          <SelectField
            id="export-scope"
            label="People to include"
            value={scopeKind}
            onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
            options={[
              { value: 'all', label: 'The whole tree' },
              { value: 'descendants', label: 'Descendants of one person' },
              { value: 'ancestors', label: 'Ancestors of one person' },
            ]}
            error={error?.fields?.scope}
          />
          {scopeKind !== 'all' ? <SelectField id="export-member" label="Person" value={scopeMember} onChange={(e) => setScopeMember(e.target.value)} options={memberOptions} /> : null}
        </FormGrid>
        <Toggle id="export-numbers" label="Show reference numbers" description="A small number in each box, used by the index." checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} />
        <Toggle id="export-generation" label="Show generation" description="“Gen 1” for the oldest generation shown, and so on." checked={showGeneration} onChange={(e) => setShowGeneration(e.target.checked)} />
        <Toggle id="export-index" label="Add an index of names" description="An alphabetical list of everyone, with where to find them." checked={includeIndex} onChange={(e) => setIncludeIndex(e.target.checked)} />

        {members.length > 0 ? (
          <section aria-label="What this PDF will look like" aria-live="polite" data-export-estimate>
            {!estimate.current && !preview ? <p className={styles.muted}>Estimating…</p> : null}
            {estimate.error && estimate.current ? <p className={styles.muted}>{estimate.error}</p> : null}
            {preview ? (
              <div className={styles.stack} style={{ opacity: estimate.current ? 1 : 0.6 }}>
                <DetailList
                  items={[
                    {
                      label: 'Printed name size',
                      value: (
                        <>
                          {preview.effectiveLabelPt.toFixed(1)} pt <Badge tone={read!.tone}>{read!.label}</Badge>
                        </>
                      ),
                    },
                    {
                      label: preview.sheets ? 'Sheets' : 'Page',
                      value: preview.sheets
                        ? `${preview.sheets.rows * preview.sheets.columns} sheets (${preview.sheets.rows} × ${preview.sheets.columns}), each ${preview.pageWidthMm} × ${preview.pageHeightMm} mm, at ${preview.scalePercent}%`
                        : `${preview.pageWidthMm} × ${preview.pageHeightMm} mm${mode === 'poster' ? `, at ${preview.scalePercent}%` : ''}`,
                    },
                    { label: 'Pages in the PDF', value: `${preview.pageCount}${includeIndex ? ' (including the index)' : ''} · ${preview.memberCount} people` },
                  ]}
                />
                {overLimit ? (
                  <Notice tone="danger" title="Too many pages">
                    This needs {preview.pageCount} pages; the limit is {preview.maxPages}. Choose a smaller scale or fewer sheets, a larger sheet size, part of the tree, or turn off the index.
                  </Notice>
                ) : null}
                {preview.warnings
                  .filter((w) => w !== 'too_many_pages')
                  .map((w) => (
                    <Notice key={w} tone={w === 'labels_unreadable' || w === 'unsupported_characters' ? 'warning' : 'info'}>
                      {WARNINGS[w] ?? w}
                    </Notice>
                  ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {error ? <Notice tone="danger">{error.message}</Notice> : null}
        <FormActions>
          <Button type="submit" disabled={busy || members.length === 0 || Boolean(overLimit && estimate.current)} icon="download">
            {pending ? 'Requesting…' : current && open(current) ? 'Preparing…' : 'Create PDF'}
          </Button>
        </FormActions>
        {members.length === 0 ? <p className={styles.muted}>Add people to your tree before creating a PDF.</p> : null}
      </form>

      {jobs.length > 0 ? (
        <ul className={styles.rowList} aria-label="Recent PDF exports" aria-live="polite">
          {jobs.map((job) => (
            <li key={job.id} className={styles.row}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  {MODE_LABEL[job.options.mode]}
                  {job.options.mode !== 'poster' ? ` · ${job.options.pageSize === 'custom' ? 'custom size' : job.options.pageSize}` : ''}
                  {job.options.scope.kind !== 'all' ? ` · ${job.options.scope.kind === 'descendants' ? 'descendants' : 'ancestors'} only` : ''}{' '}
                  <Badge tone={STATUS[job.status].tone}>{job.status === 'ready' && !job.downloadable ? 'Expired' : STATUS[job.status].label}</Badge>
                </p>
                <p className={styles.rowMeta}>
                  Requested {formatDateTime(job.createdAt)}
                  {job.pageCount ? ` · ${job.pageCount} page${job.pageCount === 1 ? '' : 's'}` : ''}
                  {job.memberCount !== null ? ` · ${job.memberCount} people` : ''}
                  {job.byteSize ? ` · ${formatBytes(job.byteSize)}` : ''}
                  {job.downloadable && job.expiresAt ? ` · available until ${formatDateTime(job.expiresAt)}` : ''}
                  {job.status === 'ready' && !job.downloadable ? ' · deleted after the storage period; create it again if you need it' : ''}
                </p>
                {open(job) ? <ProgressBar value={job.progress} label="Export progress" /> : null}
                {open(job) && job.status === 'queued' ? <p className={styles.rowMeta}>Waiting for a free slot; this usually takes seconds.</p> : null}
                {job.status === 'failed' ? <p className={styles.rowMeta}>{ERRORS[job.errorCode ?? ''] ?? 'The PDF could not be created.'}</p> : null}
                {job.status === 'ready' && job.warnings.length > 0 ? (
                  <ul className={styles.checkList}>
                    {job.warnings.map((w) => (
                      <li key={w}>{WARNINGS[w] ?? w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className={styles.inlineActions}>
                {job.downloadable ? (
                  <ButtonAnchor href={`/api/files/exports/${job.id}`} icon="download" download>
                    Download PDF
                  </ButtonAnchor>
                ) : null}
                {open(job) ? (
                  <Button variant="ghost" size="sm" onClick={() => cancel(job)} disabled={pending}>
                    Cancel
                  </Button>
                ) : null}
                {(job.status === 'failed' && job.errorCode !== 'too_many_pages' && job.errorCode !== 'scope_not_found') || (job.status === 'ready' && !job.downloadable) ? (
                  <Button variant="secondary" size="sm" onClick={() => request(job.options)} disabled={busy}>
                    {job.status === 'failed' ? 'Try again' : 'Create again'}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Your PDFs will appear here while they are prepared, and stay available for a limited time.</p>
      )}
    </Card>
  );
}
