import type { Metadata } from 'next';
import styles from '../pages.module.css';
import { EnquiryForm } from './enquiry-form';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Ask Kulvriksh a question about family workspaces, research or your family history.',
  alternates: { canonical: '/enquiry' },
};

export default function EnquiryPage() {
  return (
    <>
      <section className={styles.pageHero}>
        <div className="container">
          <p className={styles.eyebrow}>Contact</p>
          <h1 className={styles.title}>Ask us a question</h1>
          <p className={styles.lead}>Tell us a little about your family and what you would like to find out.</p>
        </div>
      </section>
      <div className={`container ${styles.body}`}>
        <div className={styles.formLayout}>
          <section className={styles.panel} aria-labelledby="enquiry-form-title">
            <h2 id="enquiry-form-title" className={styles.panelTitle}>
              Your enquiry
            </h2>
            <EnquiryForm />
          </section>
          <aside className={styles.panel} aria-labelledby="enquiry-help-title">
            <h2 id="enquiry-help-title" className={styles.panelTitle}>
              Helpful to include
            </h2>
            <ul className={styles.asideList}>
              <li>
                <strong>Your family name and region</strong>
                The village, town or district your family is associated with.
              </li>
              <li>
                <strong>What you already know</strong>
                Names and approximate dates of the earliest relatives you know about.
              </li>
              <li>
                <strong>What you would like to find</strong>
                For example, a family line, a place of origin or a family register.
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </>
  );
}
