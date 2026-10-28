// Server-side only. API calls made on behalf of the signed-in user: the session token comes from
// the HttpOnly cookie and goes to the API as a Bearer header. The API decides what the user may
// do; nothing here grants access.
import { sessionToken } from '@/lib/auth/session';
import { staffToken } from '@/lib/auth/staff-session';
import { apiRequest, type ApiResult } from './client';

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };

export async function customerApi<T>(path: string, options: Options = {}): Promise<ApiResult<T>> {
  const token = await sessionToken();
  return token ? apiRequest<T>(path, { ...options, token }) : { kind: 'unauthorized' };
}

export async function staffApi<T>(path: string, options: Options = {}): Promise<ApiResult<T>> {
  const token = await staffToken();
  return token ? apiRequest<T>(path, { ...options, token }) : { kind: 'unauthorized' };
}

/** A short, safe message for an action result; field errors are returned separately. */
export function failureMessage(result: Exclude<ApiResult<unknown>, { kind: 'ok' }>): string {
  switch (result.kind) {
    case 'invalid':
      return 'Please correct the highlighted fields.';
    case 'unauthorized':
      return 'Your session has ended or you do not have access. Sign in again.';
    case 'not_found':
      return 'This item no longer exists, or you no longer have access to it. Reload the page.';
    case 'conflict':
    case 'rejected':
      return result.message;
    case 'rate_limited':
      return 'Too many attempts. Please wait and try again.';
    case 'not_configured':
      return 'The API is not connected. Check API_INTERNAL_URL.';
    case 'unreachable':
    case 'unavailable':
      return 'The service is temporarily unavailable. Nothing was saved; please try again.';
    default:
      return 'Something went wrong. Nothing was saved.';
  }
}
