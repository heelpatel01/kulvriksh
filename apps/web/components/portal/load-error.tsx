import type { ApiResult } from '@/lib/api/client';
import { ButtonLink } from '../ui/button';
import { Card, EmptyState } from '../ui/primitives';

type Failure = Exclude<ApiResult<unknown>, { kind: 'ok' }>;

/** The first failed result of several parallel loads, or undefined when all succeeded. */
export function firstFailure(...results: ReadonlyArray<ApiResult<unknown>>): Failure | undefined {
  return results.find((r): r is Failure => r.kind !== 'ok');
}

/** The same safe, retryable error card for every screen whose data could not be loaded. */
export function LoadError({ result, retryHref }: { result: Exclude<ApiResult<unknown>, { kind: 'ok' }>; retryHref: string }) {
  const body =
    result.kind === 'unauthorized'
      ? 'Your session has ended or you do not have access. Sign in again.'
      : result.kind === 'not_configured'
        ? 'The API is not connected. Check API_INTERNAL_URL in apps/web/.env.local.'
        : 'The service is temporarily unavailable. Please try again.';
  return (
    <Card>
      <EmptyState
        icon="alert"
        title="This could not be loaded"
        action={
          <ButtonLink href={retryHref} variant="secondary">
            Try again
          </ButtonLink>
        }
      >
        {body}
      </EmptyState>
    </Card>
  );
}
