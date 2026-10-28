import { parentPort, workerData } from 'node:worker_threads';
import { ExportLimitError, renderTreePdf, type RenderInput } from './tree-render.ts';

// Worker-thread entry for one export (F-FAM-05): layout and PDF generation run here, so the API's
// event loop never waits for them. Input arrives as plain data; the PDF goes back as a transferred
// buffer. Messages carry no personal data other than the PDF itself.

export type WorkerInput = Omit<RenderInput, 'generatedAt' | 'collectManifest'> & { generatedAt: string };

export type WorkerMessage =
  | { type: 'progress'; percent: number }
  | { type: 'done'; pdf: Uint8Array; pageCount: number; memberCount: number; warnings: string[]; details: unknown }
  | { type: 'error'; code: 'too_many_pages' | 'scope_not_found' | 'generation_failed'; message: string };

const input = workerData as WorkerInput;
const post = (message: WorkerMessage, transfer: ArrayBuffer[] = []) => parentPort!.postMessage(message, transfer);

try {
  let last = -1;
  const result = renderTreePdf({ ...input, generatedAt: new Date(input.generatedAt) }, (percent) => {
    if (percent - last >= 5) {
      last = percent;
      post({ type: 'progress', percent });
    }
  });
  // Small Buffers share Node's allocation pool; copy those so only the PDF's own memory is transferred.
  const own = result.pdf.byteOffset === 0 && result.pdf.byteLength === result.pdf.buffer.byteLength;
  const pdf = own ? new Uint8Array(result.pdf.buffer, 0, result.pdf.byteLength) : new Uint8Array(result.pdf);
  post({ type: 'done', pdf, pageCount: result.pageCount, memberCount: result.memberCount, warnings: result.warnings, details: result.details }, [pdf.buffer as ArrayBuffer]);
} catch (err) {
  if (err instanceof ExportLimitError) {
    post({ type: 'error', code: err.code, message: err.message });
  } else if (err instanceof Error && err.message === 'scope member not found') {
    post({ type: 'error', code: 'scope_not_found', message: 'The chosen member is no longer in the family tree.' });
  } else {
    // The message stays inside the API's log; the requester sees only the error code.
    post({ type: 'error', code: 'generation_failed', message: err instanceof Error ? err.message : 'unknown error' });
  }
}
