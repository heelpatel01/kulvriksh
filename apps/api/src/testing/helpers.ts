// Test-only helpers. Excluded from the production build (tsconfig.build.json).
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AuthService } from '../auth/auth-service.ts';
import type { UserRole } from '../auth/auth-store.ts';
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

/** A well-formed session token (43 base64url characters) for tests. */
export const testToken = (seed: string) => seed.padEnd(43, 'x').slice(0, 43).replace(/[^A-Za-z0-9_-]/g, 'x');

/**
 * Sessions for route tests without a database: each token maps to a role. Tokens not listed are
 * treated as unknown (401), exactly as the real session lookup does.
 */
export function fakeAuth(sessions: Record<string, { role: UserRole; userId?: string }>): AuthService {
  const notScripted = () => Promise.reject(new Error('not scripted'));
  return {
    requestOtp: notScripted,
    verifyOtp: notScripted,
    logout: async () => {},
    logoutAll: async () => 0,
    async authenticate(token) {
      const entry = sessions[token];
      if (!entry) {
        return undefined;
      }
      const userId = entry.userId ?? '00000000-0000-4000-8000-000000000000';
      return {
        sessionId: `session-${token.slice(0, 6)}`,
        userId,
        role: entry.role,
        expiresAt: new Date(Date.now() + 3_600_000),
        ...(entry.role === 'customer'
          ? { customer: { id: userId, mobileNumber: '+919876543210', createdAt: new Date('2026-10-01T00:00:00Z') } }
          : { staff: { displayName: `Test ${entry.role}` } }),
      };
    },
  };
}
