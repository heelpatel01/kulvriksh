import { Worker } from 'node:worker_threads';
import type { WorkerInput, WorkerMessage } from './export-worker.ts';

// Runs one export in a dedicated worker thread with a time limit, a heap limit and cancellation.
// A new worker per export keeps exports isolated: a crash or an out-of-memory error ends that
// worker only, and terminating it frees everything it allocated.

export type RunOutcome =
  | { ok: true; pdf: Buffer; pageCount: number; memberCount: number; warnings: string[]; details: unknown }
  | { ok: false; code: 'too_many_pages' | 'scope_not_found' | 'generation_failed' | 'timeout' | 'cancelled' | 'out_of_memory'; message: string };

export interface RunOptions {
  timeoutMs: number;
  memoryMb: number;
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}

// The build compiles this file to .js next to the worker; development runs the .ts source directly.
const WORKER_URL = new URL(import.meta.url.endsWith('.ts') ? './export-worker.ts' : './export-worker.js', import.meta.url);

export function runExportInWorker(input: WorkerInput, { timeoutMs, memoryMb, onProgress, signal }: RunOptions): Promise<RunOutcome> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, code: 'cancelled', message: 'cancelled' });
      return;
    }
    const worker = new Worker(WORKER_URL, {
      workerData: input,
      resourceLimits: { maxOldGenerationSizeMb: memoryMb, maxYoungGenerationSizeMb: Math.min(64, Math.ceil(memoryMb / 8)) },
      // No inherited stdin, and no process-wide environment beyond what Node needs.
      stdin: false,
      env: {},
    });
    let settled = false;
    const finish = (outcome: RunOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      void worker.terminate();
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ ok: false, code: 'timeout', message: `export exceeded ${timeoutMs} ms` }), timeoutMs);
    const onAbort = () => finish({ ok: false, code: 'cancelled', message: 'cancelled' });
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'progress') {
        onProgress(message.percent);
      } else if (message.type === 'done') {
        finish({
          ok: true,
          pdf: Buffer.from(message.pdf.buffer, message.pdf.byteOffset, message.pdf.byteLength),
          pageCount: message.pageCount,
          memberCount: message.memberCount,
          warnings: message.warnings,
          details: message.details,
        });
      } else {
        finish({ ok: false, code: message.code, message: message.message });
      }
    });
    worker.on('error', (err: Error & { code?: string }) => {
      finish(
        err.code === 'ERR_WORKER_OUT_OF_MEMORY'
          ? { ok: false, code: 'out_of_memory', message: 'export needed more memory than allowed' }
          : { ok: false, code: 'generation_failed', message: err.message },
      );
    });
    worker.on('exit', (code) => finish({ ok: false, code: 'generation_failed', message: `worker exited with code ${code}` }));
  });
}
