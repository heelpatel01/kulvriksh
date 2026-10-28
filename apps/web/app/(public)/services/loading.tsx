import { Skeleton } from '@/components/ui/primitives';
import styles from '../pages.module.css';

// Shown during client-side navigation while the catalogue page is prepared.
export default function Loading() {
  return (
    <div className={`container ${styles.body}`} role="status" aria-live="polite">
      <span className="visually-hidden">Loading services</span>
      <div className={styles.stack}>
        <Skeleton height="2.5rem" width="20rem" />
        <Skeleton height="8rem" />
        <Skeleton height="8rem" />
      </div>
    </div>
  );
}
