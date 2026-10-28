import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, STAFF_SESSION_COOKIE } from './lib/auth/cookie';

// Fast path for the signed-in areas: no session cookie means no session, so redirect to the right
// sign-in page before rendering anything. This is a convenience only. Every page still validates
// the session and role with the API (lib/auth/session.ts, lib/auth/staff-session.ts), and the API
// enforces authentication and authorisation on every request.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const staffArea = pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/genealogist' || pathname.startsWith('/genealogist/');
  const cookie = staffArea ? STAFF_SESSION_COOKIE : SESSION_COOKIE;
  if (!request.cookies.get(cookie)) {
    const url = request.nextUrl.clone();
    url.pathname = staffArea ? '/staff/sign-in' : '/sign-in';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  // Lets a page that finds the session invalid redirect back here after sign-in.
  const forwarded = new Headers(request.headers);
  forwarded.set('x-kv-pathname', pathname);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/admin', '/admin/:path*', '/genealogist', '/genealogist/:path*'],
};
