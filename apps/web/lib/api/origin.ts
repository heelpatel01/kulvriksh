/**
 * Cross-site request forgery guard for uploads. Route handlers do not get Next.js's Server Action
 * origin check, so the browser's Origin (and Sec-Fetch-Site, when sent) must show the same site.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') {
    return false;
  }
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
