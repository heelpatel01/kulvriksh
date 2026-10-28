import { SiteFooter } from '@/components/public/site-footer';
import { SiteHeader } from '@/components/public/site-header';
import { ButtonLink } from '@/components/ui/button';
import styles from './(public)/pages.module.css';

// Real HTTP 404 for unknown URLs (never a soft 404, F-PUB-01).
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className={styles.pageHero}>
          <div className="container">
            <p className={styles.eyebrow}>Error 404</p>
            <h1 className={styles.title}>We could not find that page</h1>
            <p className={styles.lead}>The page may have moved, or the link may be incorrect.</p>
            <div className={styles.ctaRow}>
              <ButtonLink href="/">Go to the homepage</ButtonLink>
              <ButtonLink href="/enquiry" variant="secondary">
                Contact us
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
