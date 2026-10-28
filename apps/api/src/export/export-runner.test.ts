import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_OPTIONS } from './export-options.ts';
import { runExportInWorker } from './export-runner.ts';
import { randomFamily } from './synthetic-tree.ts';

// The worker thread: the API's event loop keeps running while a PDF is generated, and a slow or
// cancelled export is stopped.

const input = (size: number) => {
  const tree = randomFamily(size, 3);
  return { workspaceName: 'Test', members: tree.members, relationships: tree.relationships, options: DEFAULT_OPTIONS, generatedAt: new Date().toISOString(), maxPages: 500 };
};

describe('export worker', () => {
  it('generates a PDF off the main thread and reports progress', async () => {
    const progress: number[] = [];
    let ticks = 0;
    const ticker = setInterval(() => (ticks += 1), 1);
    const outcome = await runExportInWorker(input(800), { timeoutMs: 60_000, memoryMb: 256, onProgress: (p) => progress.push(p) });
    clearInterval(ticker);
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.pdf.subarray(0, 8).toString('latin1'), '%PDF-1.7');
      assert.equal(outcome.memberCount, 800);
    }
    assert.ok(progress.length >= 2, 'progress reported');
    assert.ok(ticks > 0, 'the main event loop kept running');
  });

  it('reports a page-limit failure as a code, not a crash', async () => {
    const outcome = await runExportInWorker({ ...input(300), options: { ...DEFAULT_OPTIONS, mode: 'tiled', scalePercent: 400 }, maxPages: 3 }, { timeoutMs: 60_000, memoryMb: 256, onProgress: () => undefined });
    assert.deepEqual(outcome.ok ? 'ok' : outcome.code, 'too_many_pages');
  });

  it('stops an export that exceeds its time limit', async () => {
    const outcome = await runExportInWorker(input(3000), { timeoutMs: 5, memoryMb: 256, onProgress: () => undefined });
    assert.deepEqual(outcome.ok ? 'ok' : outcome.code, 'timeout');
  });

  it('stops a cancelled export', async () => {
    const abort = new AbortController();
    const pending = runExportInWorker(input(3000), { timeoutMs: 60_000, memoryMb: 256, onProgress: () => undefined, signal: abort.signal });
    abort.abort();
    const outcome = await pending;
    assert.deepEqual(outcome.ok ? 'ok' : outcome.code, 'cancelled');
  });
});
