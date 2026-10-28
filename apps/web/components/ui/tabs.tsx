'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './interactive.module.css';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
}

/** WAI-ARIA tabs: arrow keys move between tabs, Home/End jump to the first/last tab. */
export function Tabs({ items, label, defaultTab }: { items: ReadonlyArray<TabItem>; label: string; defaultTab?: string }) {
  const base = useId();
  const [active, setActive] = useState(defaultTab ?? items[0]?.id ?? '');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusTab(index: number) {
    const item = items[(index + items.length) % items.length];
    if (item) {
      setActive(item.id);
      tabRefs.current[item.id]?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, () => void> = {
      ArrowRight: () => focusTab(index + 1),
      ArrowLeft: () => focusTab(index - 1),
      Home: () => focusTab(0),
      End: () => focusTab(items.length - 1),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.tabList}>
        {items.map((item, index) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[item.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {item.label}
              {item.count !== undefined ? <span className={styles.tabCount}>{item.count}</span> : null}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={item.id !== active}
          tabIndex={0}
          className={styles.tabPanel}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
