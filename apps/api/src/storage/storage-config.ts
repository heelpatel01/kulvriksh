import { resolve } from 'node:path';
import type { NodeEnv } from '../config.ts';
import { DETECTABLE_TYPES } from './file-types.ts';

// File storage settings. Limits and allowed formats are PROVISIONAL: upload rules are R23's
// decision, voice length R24's. Only the local private-disk backend exists; no object-storage
// credentials are configured, so production must set STORAGE_LOCAL_DIR explicitly (or uploads
// answer 503) until a cloud adapter is chosen.

export interface StorageConfig {
  readonly backend: 'local';
  /** Absent: file features answer 503. */
  readonly localDir?: string;
  readonly mediaMaxBytes: number;
  readonly reportMaxBytes: number;
  readonly workspaceQuotaBytes: number;
  readonly allowedMediaTypes: readonly string[];
  /** Temporary uploads older than this are treated as abandoned by the cleanup command. */
  readonly abandonedUploadSeconds: number;
}

const MB = 1024 * 1024;
export const DEFAULT_ALLOWED_MEDIA_TYPES = DETECTABLE_TYPES;

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

export function readStorageConfig(env: NodeJS.ProcessEnv, nodeEnv: NodeEnv, issues: string[]): StorageConfig {
  const backend = env.STORAGE_BACKEND?.trim() || 'local';
  if (backend !== 'local') {
    issues.push('STORAGE_BACKEND must be local (no object-storage provider is configured yet)');
  }
  // In development the store defaults to the repository's git-ignored .data directory.
  const dir = env.STORAGE_LOCAL_DIR?.trim() || (nodeEnv === 'development' ? resolve(import.meta.dirname, '..', '..', '..', '..', '.data', 'storage') : undefined);
  let allowedMediaTypes = DEFAULT_ALLOWED_MEDIA_TYPES;
  const allowed = env.MEDIA_ALLOWED_TYPES?.trim();
  if (allowed) {
    const types = allowed.split(',').map((t) => t.trim());
    const unknown = types.filter((t) => !DETECTABLE_TYPES.includes(t));
    if (unknown.length > 0) {
      issues.push(`MEDIA_ALLOWED_TYPES may list only ${DETECTABLE_TYPES.join(', ')}`);
    } else {
      allowedMediaTypes = types;
    }
  }
  return {
    backend: 'local',
    ...(dir ? { localDir: dir } : {}),
    mediaMaxBytes: bounded('MEDIA_MAX_BYTES', env.MEDIA_MAX_BYTES, 20 * MB, 1024, 200 * MB, issues),
    reportMaxBytes: bounded('REPORT_FILE_MAX_BYTES', env.REPORT_FILE_MAX_BYTES, 25 * MB, 1024, 200 * MB, issues),
    workspaceQuotaBytes: bounded('MEDIA_WORKSPACE_QUOTA_BYTES', env.MEDIA_WORKSPACE_QUOTA_BYTES, 1024 * MB, MB, 1024 * 1024 * MB, issues),
    allowedMediaTypes,
    abandonedUploadSeconds: bounded('STORAGE_ABANDONED_UPLOAD_SECONDS', env.STORAGE_ABANDONED_UPLOAD_SECONDS, 3600, 60, 7 * 86_400, issues),
  };
}
