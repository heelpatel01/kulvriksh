import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState, Notice } from '@/components/ui/primitives';
import { fetchPublicServices, PUBLIC_SERVICES_TAG } from '@/lib/api/public-services';
import styles from '../pages.module.css';
import { ServicesUnavailable } from './services-unavailable';

export const metadata: Metadata = {
  title: 'Services',
  description: 'Family workspaces, genealogy research and family voices from Kulvriksh.',
  alternates: { canonical: '/services' },
};

// Revalidated public page (Product Flows F-PUB-03): active services from the API, cached as
// non-personal public content. Admin changes expire the tag immediately (updateTag); the
// 60-second revalidation is a safety net. No session or per-user data is read here.
const REVALIDATE_SECONDS = 60;

export default async function ServicesPage() {
  const result = await fetchPublicServices({
    baseUrl: process.env.API_INTERNAL_URL,
    init: { next: { revalidate: REVALIDATE_SECONDS, tags: [PUBLIC_SERVICES_TAG] } },
  });

  if (result.kind === 'unavailable' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // At runtime, throwing keeps the last successfully generated page during background
    // revalidation; with no good page yet, the error boundary shows the retry state.
    throw new Error('Service catalogue unavailable');
  }

  return (
    <>
      <section className={styles.pageHero}>
        <div className="container">
          <p className={styles.eyebrow}>Services</p>
          <h1 className={styles.title}>Services for your family history</h1>
          <p className={styles.lead}>
            Start with a private family workspace, then add research by a genealogist and family voices whenever you
            are ready.
          </p>
        </div>
      </section>

      <div className={`container ${styles.body}`}>
        <div className={styles.stack}>
          {result.kind !== 'ok' ? (
            <ServicesUnavailable />
          ) : result.services.length === 0 ? (
            <EmptyState
              icon="book"
              title="No services are available right now"
              action={
                <ButtonLink href="/enquiry" variant="secondary">
                  Ask us a question
                </ButtonLink>
              }
            >
              Our services are being prepared. Tell us what you are looking for and we will get back to you.
            </EmptyState>
          ) : (
            <>
              <Notice tone="info" title="Plans and pricing are being finalised">
                Plans and prices will be confirmed before launch, and no purchases can be made yet.
              </Notice>
              {result.services.map((service) => (
                <section key={service.id} className={styles.serviceBlock} aria-labelledby={`service-${service.id}`}>
                  <div className={styles.serviceHead}>
                    <span className={styles.serviceIcon}>
                      <Icon name="book" size={22} />
                    </span>
                    <div>
                      <h2 id={`service-${service.id}`} className={styles.serviceTitle}>
                        {service.name}
                      </h2>
                      <p className={styles.serviceText}>{service.description}</p>
                    </div>
                  </div>
                  <div className={styles.ctaRow}>
                    <ButtonLink href="/enquiry" variant="secondary">
                      Ask about this service
                    </ButtonLink>
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
