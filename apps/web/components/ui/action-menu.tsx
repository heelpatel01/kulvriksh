'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './icon';
import styles from './interactive.module.css';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  tone?: 'danger';
  disabled?: boolean;
}

/** A row-actions menu button (WAI-ARIA menu button pattern). */
export function ActionMenu({ label, actions }: { label: string; actions: ReadonlyArray<MenuAction> }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    itemRefs.current.find((item) => item && !item.disabled)?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled));
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      enabled[(index + 1) % enabled.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      enabled[(index - 1 + enabled.length) % enabled.length]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.menuRoot} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.iconButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" />
      </button>
      {open ? (
        <ul id={menuId} role="menu" aria-label={label} className={styles.menu} onKeyDown={onMenuKeyDown}>
          {actions.map((action, index) => (
            <li key={action.label} role="none">
              <button
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                className={action.tone === 'danger' ? `${styles.menuItem} ${styles.menuItemDanger}` : styles.menuItem}
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
