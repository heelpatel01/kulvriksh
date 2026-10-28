import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Readable } from 'node:stream';
import type { ExportPreviewView } from '@kulvriksh/shared';
import type { FileContent } from '../files/file-store.ts';
import type { Logger } from '../logger.ts';
import { newStorageKey, UploadTooLargeError, type StorageProvider } from '../storage/storage.ts';
import type { ExportConfig } from './export-config.ts';
import type { ExportOptions } from './export-options.ts';
import { runExportInWorker, type RunOutcome } from './export-runner.ts';
import type { ClaimedJob, ExportAccess, ExportStore } from './export-store.ts';

// Runs export jobs inside the API process (F-FAM-05 step 3, Flows §12.4): bounded concurrency,
// each job in its own worker thread with time and memory limits, a fenced lease with heartbeats,
// and the PDF stored through the storage abstraction. A job whose lease is lost (cancelled, or
// recovered after a restart) discards its result and deletes its own output.

export type EntitlementCheck = (userId: string) => Promise<boolean>;

export type ExportRequestResult = Awaited<ReturnType<ExportStore['request']>> | { kind: 'entitlement_required' };

export interface ExportService {
  request(access: ExportAccess, options: ExportOptions, requestId?: string): Promise<ExportRequestResult>;
  /** What the chosen options would produce (page count, printed name size, sheets), without drawing. */
  preview(access: ExportAccess, options: ExportOptions): Promise<{ kind: 'ok'; preview: ExportPreviewView } | { kind: 'no_workspace' | 'busy' | 'scope_not_found' | 'failed' }>;
  /** Claims and runs queued jobs up to the concurrency limit. Resolves when the claimed jobs finish. */
  drain(): Promise<number>;
  /** Recovery and expiry, run on a timer and once at startup. */
  maintain(): Promise<{ recovered: number; expired: number }>;
  open(content: FileContent): Promise<{ stream: Readable; byteSize: number }>;
  start(): void;
  stop(): Promise<void>;
  readonly running: number;
}

const POLL_MS = 5_000;
const MAINTAIN_MS = 60_000;
const HEARTBEAT_MS = 1_000;
/** Previews run the real layout in a worker; at most this many at once per process. */
const PREVIEW_CONCURRENCY = 2;
const PREVIEW_TIMEOUT_MS = 20_000;

export function createExportService(deps: {
  store: ExportStore;
  storage: StorageProvider;
  config: ExportConfig;
  logger: Logger;
  /** R14: set only when an entitlement gate for tree export is configured. */
  entitlement?: EntitlementCheck;
}): ExportService {
  const { store, storage, config, logger, entitlement } = deps;
  const owner = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const leaseSeconds = config.timeoutSeconds + 60;
  const active = new Set<Promise<void>>();
  const aborts = new Set<AbortController>();
  let timer: NodeJS.Timeout | undefined;
  let maintainTimer: NodeJS.Timeout | undefined;
  let stopping = false;
  let previews = 0;

  async function run(job: ClaimedJob): Promise<void> {
    const abort = new AbortController();
    aborts.add(abort);
    let lastBeat = 0;
    let beating = Promise.resolve();
    const started = performance.now();
    let outcome: RunOutcome;
    try {
      const tree = await store.loadTree(job.workspaceId);
      if (!tree) {
        await store.fail(job, 'too_large');
        return;
      }
      outcome = await runExportInWorker(
        {
          workspaceName: tree.name,
          members: tree.members,
          relationships: tree.relationships,
          options: job.options,
          generatedAt: new Date().toISOString(),
          maxPages: config.maxPages,
        },
        {
          timeoutMs: config.timeoutSeconds * 1000,
          memoryMb: config.workerMemoryMb,
          signal: abort.signal,
          onProgress: (percent) => {
            const now = Date.now();
            if (now - lastBeat < HEARTBEAT_MS) {
              return;
            }
            lastBeat = now;
            // A failed fenced heartbeat means the job was cancelled or recovered: stop the worker.
            beating = beating.then(() => store.heartbeat(job, percent, leaseSeconds)).then(
              (ok) => (ok ? undefined : abort.abort()),
              (err: unknown) => logger.warn('export heartbeat failed', { jobId: job.id, err }),
            );
          },
        },
      );
      await beating;
    } catch (err) {
      logger.error('export failed to start', { jobId: job.id, err });
      await store.fail(job, 'generation_failed').catch(() => undefined);
      return;
    } finally {
      aborts.delete(abort);
    }
    if (!outcome.ok) {
      if (outcome.code === 'cancelled' && stopping) {
        // Shutting down: say so now rather than waiting for the lease to expire.
        await store.fail(job, 'interrupted').catch(() => undefined);
      } else if (outcome.code !== 'cancelled') {
        logger.warn('export failed', { jobId: job.id, code: outcome.code, ...(outcome.code === 'generation_failed' ? { reason: outcome.message } : {}) });
        await store.fail(job, outcome.code);
      }
      return;
    }
    if (outcome.pdf.length > config.maxBytes) {
      await store.fail(job, 'too_large');
      return;
    }
    try {
      const temp = await storage.writeTemp(Readable.from([outcome.pdf]), config.maxBytes);
      const key = newStorageKey('export');
      await storage.commit(temp, key);
      let done = false;
      try {
        done = await store.complete(
          job,
          { storageBackend: storage.backend, storageKey: key, contentType: 'application/pdf', byteSize: temp.byteSize, sha256: temp.sha256 },
          { pageCount: outcome.pageCount, memberCount: outcome.memberCount, warnings: outcome.warnings },
          config.retentionHours,
        );
      } finally {
        if (!done) {
          await storage.delete(key);
        }
      }
      // Measurements only: no names or other family data are logged.
      logger.info('export ready', { jobId: job.id, done, pages: outcome.pageCount, members: outcome.memberCount, bytes: temp.byteSize, ms: Math.round(performance.now() - started) });
    } catch (err) {
      logger.error('export could not be stored', { jobId: job.id, err });
      await store.fail(job, err instanceof UploadTooLargeError ? 'too_large' : 'storage_failed').catch(() => undefined);
    }
  }

  async function drain(): Promise<number> {
    let started = 0;
    const claimed: Array<Promise<void>> = [];
    while (!stopping && active.size < config.concurrency) {
      const job = await store.claim(owner, leaseSeconds);
      if (!job) {
        break;
      }
      started += 1;
      const p: Promise<void> = run(job)
        .catch((err: unknown) => logger.error('export run crashed', { jobId: job.id, err }))
        .finally(() => {
          active.delete(p);
          // A finished job frees a slot: pick up the next queued one.
          if (!stopping) {
            void drain().catch((err: unknown) => logger.warn('export drain failed', { err }));
          }
        });
      active.add(p);
      claimed.push(p);
    }
    await Promise.all(claimed);
    return started;
  }

  async function maintain() {
    const recovered = await store.recoverExpired();
    let expired = 0;
    for (const file of await store.expireFinished(100)) {
      try {
        await storage.delete(file.storageKey);
        await store.forgetFile(file.fileId);
        expired += 1;
      } catch (err) {
        logger.warn('expired export file removal failed; the cleanup will retry', { fileId: file.fileId, err });
      }
    }
    if (recovered > 0) {
      logger.warn('export jobs recovered after an interrupted run', { recovered });
    }
    return { recovered, expired };
  }

  return {
    async preview(access, options) {
      const ws = await store.workspaceFor(access);
      if (!ws) {
        return { kind: 'no_workspace' };
      }
      if (previews >= PREVIEW_CONCURRENCY) {
        return { kind: 'busy' };
      }
      previews += 1;
      try {
        const tree = await store.loadTree(ws.id);
        if (!tree) {
          return { kind: 'failed' };
        }
        const outcome = await runExportInWorker(
          { workspaceName: tree.name, members: tree.members, relationships: tree.relationships, options, generatedAt: new Date().toISOString(), maxPages: config.maxPages, preview: true },
          { timeoutMs: PREVIEW_TIMEOUT_MS, memoryMb: config.workerMemoryMb, onProgress: () => undefined },
        );
        if (!outcome.ok) {
          return { kind: outcome.code === 'scope_not_found' ? 'scope_not_found' : 'failed' };
        }
        const d = outcome.details as { mode: ExportOptions['mode']; pageWidthMm: number; pageHeightMm: number; sheets?: { rows: number; columns: number }; effectiveLabelPt: number; scale: number };
        return {
          kind: 'ok',
          preview: {
            mode: d.mode,
            pageCount: outcome.pageCount,
            maxPages: config.maxPages,
            withinLimits: outcome.pageCount <= config.maxPages,
            memberCount: outcome.memberCount,
            pageWidthMm: d.pageWidthMm,
            pageHeightMm: d.pageHeightMm,
            sheets: d.sheets ?? null,
            effectiveLabelPt: d.effectiveLabelPt,
            scalePercent: Math.round(d.scale * 1000) / 10,
            warnings: outcome.warnings,
          },
        };
      } finally {
        previews -= 1;
      }
    },

    async request(access, options, requestId) {
      if (entitlement && access.kind === 'owner' && !(await entitlement(access.userId))) {
        return { kind: 'entitlement_required' };
      }
      const result = await store.request({ access, options, queueLimit: config.queueLimit, requestId });
      if (result.kind === 'created') {
        // Start now if there is a free slot; otherwise the job waits in the queue.
        void drain().catch((err: unknown) => logger.warn('export drain failed', { err }));
      }
      return result;
    },
    drain,
    maintain,
    open: (content) => storage.open(content.storageKey),
    start() {
      stopping = false;
      const tick = () => {
        void maintain()
          .then(() => drain())
          .catch((err: unknown) => logger.warn('export scheduler tick failed', { err }));
      };
      setTimeout(tick, 1_000).unref();
      timer = setInterval(() => void drain().catch((err: unknown) => logger.warn('export drain failed', { err })), POLL_MS);
      timer.unref();
      maintainTimer = setInterval(tick, MAINTAIN_MS);
      maintainTimer.unref();
    },
    async stop() {
      stopping = true;
      clearInterval(timer);
      clearInterval(maintainTimer);
      aborts.forEach((a) => a.abort());
      await Promise.allSettled([...active]);
    },
    get running() {
      return active.size;
    },
  };
}
