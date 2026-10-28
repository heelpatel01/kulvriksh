// Family tree export settings (F-FAM-05). All PROVISIONAL: retention is FQ-11's decision, the
// concurrency that a 1 vCPU / 4 GB server can carry is measured in Roadmap Phase 10, and export by
// assigned genealogists is R28/FQ-25 (off by default, as the permissions matrix requires).
// Export by admins (FQ-14) has no setting: it stays denied until decided.

export interface ExportConfig {
  /** Exports generated at the same time by this process (each in its own worker thread). */
  readonly concurrency: number;
  /** Open (queued + running) jobs across all users before new requests get 429 "busy". */
  readonly queueLimit: number;
  readonly timeoutSeconds: number;
  readonly maxPages: number;
  readonly maxBytes: number;
  /** Worker heap limit; a tree that needs more fails instead of starving the API. */
  readonly workerMemoryMb: number;
  /** How long a finished PDF can be downloaded before it is deleted (FQ-11). */
  readonly retentionHours: number;
  /** R28/FQ-25: 'assigned' lets a genealogist export the tree of a workspace they are currently assigned to. */
  readonly genealogistAccess: 'off' | 'assigned';
}

function bounded(name: string, raw: string | undefined, fallback: number, min: number, max: number, issues: string[]): number {
  const value = raw?.trim();
  if (!value) {
    return fallback;
  }
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    issues.push(`${name} must be an integer from ${min} to ${max}`);
    return fallback;
  }
  return Number(value);
}

export function readExportConfig(env: NodeJS.ProcessEnv, issues: string[]): ExportConfig {
  const access = env.EXPORT_GENEALOGIST_ACCESS?.trim() || 'off';
  if (access !== 'off' && access !== 'assigned') {
    issues.push('EXPORT_GENEALOGIST_ACCESS must be off or assigned');
  }
  return {
    concurrency: bounded('EXPORT_CONCURRENCY', env.EXPORT_CONCURRENCY, 1, 1, 4, issues),
    queueLimit: bounded('EXPORT_QUEUE_LIMIT', env.EXPORT_QUEUE_LIMIT, 20, 1, 500, issues),
    timeoutSeconds: bounded('EXPORT_TIMEOUT_SECONDS', env.EXPORT_TIMEOUT_SECONDS, 120, 5, 900, issues),
    maxPages: bounded('EXPORT_MAX_PAGES', env.EXPORT_MAX_PAGES, 300, 1, 2000, issues),
    maxBytes: bounded('EXPORT_MAX_BYTES', env.EXPORT_MAX_BYTES, 50 * 1024 * 1024, 1024 * 1024, 500 * 1024 * 1024, issues),
    workerMemoryMb: bounded('EXPORT_WORKER_MEMORY_MB', env.EXPORT_WORKER_MEMORY_MB, 512, 64, 2048, issues),
    retentionHours: bounded('EXPORT_RETENTION_HOURS', env.EXPORT_RETENTION_HOURS, 24, 1, 720, issues),
    genealogistAccess: access === 'assigned' ? 'assigned' : 'off',
  };
}
