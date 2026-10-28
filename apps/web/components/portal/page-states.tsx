import { Skeleton } from '../ui/primitives';
import styles from './page-states.module.css';

/** Route-level loading state shown inside the (still mounted) portal layout. */
export function PortalLoading({ label }: { label: string }) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <Skeleton height="2rem" width="16rem" />
      <Skeleton height="1rem" width="28rem" />
      <div className={styles.loadingGrid}>
        <Skeleton height="6.5rem" />
        <Skeleton height="6.5rem" />
        <Skeleton height="6.5rem" />
      </div>
      <Skeleton height="16rem" />
    </div>
  );
}
