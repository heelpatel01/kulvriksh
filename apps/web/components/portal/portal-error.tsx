'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '../ui/button';
import { Icon } from '../ui/icon';
import styles from './page-states.module.css';

/** Route-level error state with retry. Error details are never shown to the user. */
export function PortalError({ retry, homeHref, digest }: { retry: () => void; homeHref: string; digest?: string }) {
  useEffect(() => {
    document.getElementById('portal-main')?.focus();
  }, []);

  return (
    <div className={styles.error} role="alert">
      <span className={styles.errorIcon}>
        <Icon name="alert" size={22} />
      </span>
      <h1 className={styles.errorTitle}>This page could not be loaded</h1>
      <p className={styles.errorText}>
        Something went wrong while preparing this page. You can try again, or go back to the overview.
      </p>
      {digest ? <p className={styles.errorRef}>Reference: {digest}</p> : null}
      <div className={styles.errorActions}>
        <Button onClick={retry} icon="activity">
          Try again
        </Button>
        <ButtonLink href={homeHref} variant="secondary">
          Back to overview
        </ButtonLink>
      </div>
    </div>
  );
}
