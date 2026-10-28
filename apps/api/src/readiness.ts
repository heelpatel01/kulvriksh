import type { DependencyState } from '@kulvriksh/shared';
import type { Logger } from './logger.ts';

/**
 * Checks that the database accepts queries. The real implementation (a `SELECT 1` through the
 * shared database client) is added with the approved database driver; tests use fakes.
 * Implementations must honour the abort signal.
 */
export interface DatabaseProbe {
  ping(signal: AbortSignal): Promise<void>;
}

export const DEFAULT_READINESS_TIMEOUT_MS = 2000;

/**
 * Runs one probe with a hard timeout. Failure details go to the log in the safe error form
 * (connection errors can contain hosts and user names); callers only learn up/down.
 */
export async function checkDatabase(
  probe: DatabaseProbe | undefined,
  logger: Logger,
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
): Promise<DependencyState> {
  if (!probe) {
    return 'not_configured';
  }
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject first: abort listeners run synchronously, and the probe's own "aborted"
      // rejection must not win the race and hide that this was a timeout.
      reject(new Error(`database readiness check timed out after ${timeoutMs} ms`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    await Promise.race([probe.ping(controller.signal), timeout]);
    return 'up';
  } catch (err) {
    logger.warn('database readiness check failed', { err });
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
