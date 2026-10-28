'use client';

import styles from '../pages.module.css';
import { ServicesUnavailable } from './services-unavailable';

// API unavailable at request time and no previously generated page to fall back on.
export default function ServicesError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className={`container ${styles.body}`}>
      <h1 className={styles.title}>Services</h1>
      <div style={{ marginTop: 'var(--space-5)' }}>
        <ServicesUnavailable onRetry={retry} />
      </div>
    </div>
  );
}
