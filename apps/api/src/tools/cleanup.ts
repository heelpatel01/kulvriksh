// Maintenance command: delete expired OTP challenges, rate-limit buckets, lockouts and sessions,
// abandoned uploads, and expired tree exports.
//   npm run db:cleanup                       (development, from the repository root)
//   node --env-file=.env dist/tools/cleanup.js   (production build; schedule it, see README)
// Options: --batch-size <n> --max-batches <n> --grace-hours <n>. It connects as the runtime role
// (DATABASE_URL) and prints only counts.
import { ConfigError, loadConfig } from '../config.ts';
import { createDatabase } from '../db.ts';
import type { ExportConfig } from '../export/export-config.ts';
import { createExportService } from '../export/export-service.ts';
import { createPrismaExportStore } from '../export/export-store.ts';
import { createFileService } from '../files/file-service.ts';
import { createPrismaFileStore } from '../files/file-store.ts';
import { createLogger } from '../logger.ts';
import { DEFAULT_CLEANUP, runCleanup, type CleanupOptions } from '../maintenance/cleanup.ts';
import type { StorageConfig } from '../storage/storage-config.ts';
import { LocalDiskStorage } from '../storage/storage.ts';

function option(name: string, fallback: number, min: number, max: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`cleanup: --${name} must be an integer from ${min} to ${max}`);
    process.exit(2);
  }
  return value;
}

let databaseUrl: string | undefined;
let storage: StorageConfig | undefined;
let exportConfig: ExportConfig | undefined;
try {
  const config = loadConfig();
  databaseUrl = config.databaseUrl;
  storage = config.storage;
  exportConfig = config.export;
} catch (err) {
  console.error(err instanceof ConfigError ? `cleanup: ${err.issues.join('; ')}` : 'cleanup: invalid configuration');
  process.exit(2);
}
if (!databaseUrl) {
  console.error('cleanup: DATABASE_URL is not set');
  process.exit(2);
}

const options: CleanupOptions = {
  batchSize: option('batch-size', DEFAULT_CLEANUP.batchSize, 1, 10_000),
  maxBatches: option('max-batches', DEFAULT_CLEANUP.maxBatches, 1, 10_000),
  graceSeconds: option('grace-hours', DEFAULT_CLEANUP.graceSeconds / 3600, 0, 24 * 90) * 3600,
};

const db = createDatabase(databaseUrl);
try {
  const started = Date.now();
  const counts = await runCleanup(db.prisma, options);
  // Files: abandoned temporary uploads, and stored files whose byte removal failed earlier.
  const files = storage?.localDir
    ? await createFileService({
        storage: new LocalDiskStorage(storage.localDir),
        store: createPrismaFileStore(db.prisma),
        config: storage,
        logger: createLogger({ level: 'warn' }),
      }).sweep()
    : { abandonedUploads: 0, retriedDeletions: 0, note: 'STORAGE_LOCAL_DIR not set' };
  // Tree exports: jobs whose lease expired, and finished PDFs past their retention (FQ-11). The API
  // does this every minute while it runs; the command covers a stopped API.
  const exportsDone =
    storage?.localDir && exportConfig
      ? await createExportService({
          store: createPrismaExportStore(db.prisma),
          storage: new LocalDiskStorage(storage.localDir),
          config: exportConfig,
          logger: createLogger({ level: 'warn' }),
        }).maintain()
      : { recovered: 0, expired: 0 };
  console.log(
    JSON.stringify({ msg: 'cleanup finished', durationMs: Date.now() - started, ...counts, ...files, exportsRecovered: exportsDone.recovered, exportsExpired: exportsDone.expired }),
  );
} catch (err) {
  console.error(`cleanup failed: ${err instanceof Error ? err.message.split('\n')[0] : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
