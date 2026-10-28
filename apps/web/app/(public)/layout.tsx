import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/public/site-footer';
import { SiteHeader } from '@/components/public/site-header';

// Public website layout. Public pages are statically rendered, never read session or
// per-user data, and keep this header and footer mounted during navigation (F-PUB-01).
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
