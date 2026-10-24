// Test-only helpers. Excluded from the production build (tsconfig.build.json).
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLogger, type Logger } from '../logger.ts';

export interface CapturedLogger {
  logger: Logger;
  lines: Record<string, unknown>[];
  raw: string[];
}

/** A logger that records every emitted line (at debug level) instead of writing to stdout. */
export function captureLogger(): CapturedLogger {
  const lines: Record<string, unknown>[] = [];
  const raw: string[] = [];
  const logger = createLogger({
    level: 'debug',
    sink: (line) => {
      raw.push(line);
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  return { logger, lines, raw };
}

export interface RunningServer {
  baseUrl: string;
  close(): Promise<void>;
}

/** Starts a handler on an ephemeral localhost port. */
export async function startServer(handler: RequestListener): Promise<RunningServer> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
