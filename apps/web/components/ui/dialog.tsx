'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './icon';
import styles from './interactive.module.css';

/**
 * Modal dialog built on the native <dialog> element: it traps focus, closes on Escape
 * and returns focus to the element that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) {
          onClose();
        }
      }}
    >
      <div className={styles.dialogInner}>
        <header className={styles.dialogHeader}>
          <div>
            <h2 id={titleId} className={styles.dialogTitle}>
              {title}
            </h2>
            {description ? <p className={styles.dialogDescription}>{description}</p> : null}
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </header>
        <div className={styles.dialogBody}>{children}</div>
        {footer ? <footer className={styles.dialogFooter}>{footer}</footer> : null}
      </div>
    </dialog>
  );
}
