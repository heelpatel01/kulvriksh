import type { Metadata } from 'next';
import styles from '../../pages.module.css';
import { SetupForm } from './setup-form';

export const metadata: Metadata = {
  title: 'Set your password',
  robots: { index: false },
  // The page reads a one-time token; never leak the URL to other sites.
  referrer: 'no-referrer',
};

export default function StaffSetupPage() {
  return (
    <>
      <section className={styles.pageHero}>
        <div className="container">
          <p className={styles.eyebrow}>Staff</p>
          <h1 className={styles.title}>Set your password</h1>
          <p className={styles.lead}>Choose the password for your Kulvriksh staff account. The link works once.</p>
        </div>
      </section>
      <div className={`container ${styles.body}`}>
        <section className={styles.panel} aria-labelledby="setup-title">
          <h2 id="setup-title" className={styles.panelTitle}>
            New password
          </h2>
          <SetupForm />
        </section>
      </div>
    </>
  );
}
