import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice } from '@/components/ui/primitives';
import { getStaffSession } from '@/lib/auth/staff-session';
import styles from '../../pages.module.css';
import { StaffSignInForm } from './staff-sign-in-form';

export const metadata: Metadata = {
  title: 'Staff sign-in',
  description: 'Sign-in for Kulvriksh genealogists and administrators.',
  robots: { index: false },
};

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = typeof raw === 'string' ? raw : '';
  // A signed-in staff member goes straight to their own area; a stale cookie shows the form.
  const session = await getStaffSession();
  if (session.kind === 'signed_in') {
    redirect(`/${session.user.role}`);
  }
  return (
    <>
      <section className={styles.pageHero}>
        <div className="container">
          <p className={styles.eyebrow}>Staff</p>
          <h1 className={styles.title}>Staff sign-in</h1>
          <p className={styles.lead}>For Kulvriksh genealogists and administrators. Customers sign in with their mobile number.</p>
        </div>
      </section>
      <div className={`container ${styles.body}`}>
        <div className={styles.formLayout}>
          <section className={styles.panel} aria-labelledby="staff-title">
            <h2 id="staff-title" className={styles.panelTitle}>
              Sign in with your work account
            </h2>
            {session.kind === 'unavailable' ? (
              <Notice tone="warning" title="Sign-in may not work right now">
                We could not check your sign-in status. You can still try; if it fails, please try again shortly.
              </Notice>
            ) : null}
            <StaffSignInForm next={next} />
          </section>
          <section className={styles.panel} aria-labelledby="staff-help">
            <h2 id="staff-help" className={styles.panelTitle}>
              About staff accounts
            </h2>
            <div className={styles.formStack}>
              <p>
                Staff accounts are created by Kulvriksh, never through this website. The sign-in method is provisional until it
                is agreed (R9).
              </p>
              <p>
                Customers: <Link href="/sign-in">sign in with your mobile number</Link>.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
