import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { safeReturnPath } from '@/lib/auth/cookie';
import { getCustomerSession } from '@/lib/auth/session';
import styles from '../pages.module.css';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Kulvriksh family workspace.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeReturnPath((await searchParams).next);
  // Signed-in customers go straight to their area (F-AUTH-05). Only a session the API confirms
  // counts, so a stale cookie shows the form instead of bouncing between pages.
  const session = await getCustomerSession();
  if (session.kind === 'signed_in') {
    redirect(next);
  }
  return (
    <>
      <section className={styles.pageHero}>
        <div className="container">
          <p className={styles.eyebrow}>Sign in</p>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.lead}>Customers sign in with a one-time code sent to their mobile number.</p>
        </div>
      </section>
      <div className={`container ${styles.body}`}>
        <div className={styles.formLayout}>
          <section className={styles.panel} aria-labelledby="otp-title">
            <h2 id="otp-title" className={styles.panelTitle}>
              Sign in with your mobile number
            </h2>
            {session.kind === 'unavailable' ? (
              <Notice tone="warning" title="Sign-in may not work right now">
                We could not check your sign-in status. You can still try; if it fails, please try again shortly.
              </Notice>
            ) : null}
            <SignInForm next={next} />
          </section>
          <section className={styles.panel} aria-labelledby="staff-title">
            <h2 id="staff-title" className={styles.panelTitle}>
              Kulvriksh staff
            </h2>
            <div className={styles.formStack}>
              <p>Genealogists and administrators sign in with their work account.</p>
              <Link href="/staff/sign-in" className={styles.portalChoice}>
                <span className={styles.portalChoiceIcon}>
                  <Icon name="shield" size={18} />
                </span>
                <span className={styles.portalChoiceText}>
                  <span className={styles.portalChoiceTitle}>Staff sign-in</span>
                  <span className={styles.portalChoiceBody}>Genealogist portal and admin panel</span>
                </span>
                <Icon name="chevronRight" size={18} />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
