import type { Metadata } from 'next';
import styles from '../../pages.module.css';
import { ResetRequestForm } from './reset-request-form';

export const metadata: Metadata = { title: 'Reset your staff password', robots: { index: false } };

export default function StaffResetPage() {
  return (
    <>
      <section className={styles.pageHero}>
        <div className="container">
          <p className={styles.eyebrow}>Staff</p>
          <h1 className={styles.title}>Reset your password</h1>
          <p className={styles.lead}>We will send a one-time link to your work email if it belongs to a staff account.</p>
        </div>
      </section>
      <div className={`container ${styles.body}`}>
        <section className={styles.panel} aria-labelledby="reset-title">
          <h2 id="reset-title" className={styles.panelTitle}>
            Work email
          </h2>
          <ResetRequestForm />
        </section>
      </div>
    </>
  );
}
