// Static presentational building blocks. Safe to use from Server and Client Components.
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import styles from './primitives.module.css';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[`tone-${tone}`]}`}>{children}</span>;
}

export function Card({
  title,
  description,
  action,
  children,
  padded = true,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      {title ? (
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{title}</h2>
            {description ? <p className={styles.cardDescription}>{description}</p> : null}
          </div>
          {action ? <div className={styles.cardAction}>{action}</div> : null}
        </header>
      ) : null}
      <div className={padded ? styles.cardBody : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className={styles.pageHeader}>
      <div>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.statTop}>
        <p className={styles.statLabel}>{label}</p>
        {icon ? (
          <span className={styles.statIcon}>
            <Icon name={icon} size={18} />
          </span>
        ) : null}
      </div>
      <p className={styles.statValue}>{value}</p>
      {hint ? <p className={styles.statHint}>{hint}</p> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className={styles.statGrid}>{children}</div>;
}

export function EmptyState({
  icon = 'info',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={22} />
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      {children ? <p className={styles.emptyBody}>{children}</p> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}

const NOTICE_ICONS: Record<'info' | 'warning' | 'success' | 'danger', IconName> = {
  info: 'info',
  warning: 'alert',
  success: 'check',
  danger: 'alert',
};

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.notice} ${styles[`notice-${tone}`]}`}>
      <Icon name={NOTICE_ICONS[tone]} size={18} className={styles.noticeIcon} />
      <div>
        {title ? <p className={styles.noticeTitle}>{title}</p> : null}
        <div className={styles.noticeBody}>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ height = '1rem', width = '100%' }: { height?: string; width?: string }) {
  return <span className={styles.skeleton} style={{ height, width }} aria-hidden="true" />;
}

/** Two-column responsive grid for dashboard cards. */
export function Grid({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 }) {
  return <div className={columns === 3 ? styles.grid3 : styles.grid2}>{children}</div>;
}

/** Definition list for key/value details. */
export function DetailList({ items }: { items: ReadonlyArray<{ label: string; value: ReactNode }> }) {
  return (
    <dl className={styles.details}>
      {items.map((item) => (
        <div key={item.label} className={styles.detailRow}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={styles.progress}>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <span className={styles.progressFill} style={{ width: `${clamped}%` }} />
      </div>
      <span className={styles.progressValue}>{clamped}%</span>
    </div>
  );
}
