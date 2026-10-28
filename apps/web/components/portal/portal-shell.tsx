'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/icon';
import { ToastProvider } from '../ui/toast';
import styles from './portal-shell.module.css';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Match only the exact path (used for the area's overview page). */
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: ReadonlyArray<NavItem>;
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Shared layout for the customer, genealogist and admin areas. It stays mounted while the
 * user moves between pages of one area, so navigation is client-side and the sidebar
 * keeps its state.
 */
export function PortalShell({
  areaLabel,
  areaHref,
  sections,
  user,
  exitControl,
  previewNote = 'Some screens in this area still show sample data; they are labelled.',
  children,
}: {
  areaLabel: string;
  areaHref: string;
  sections: ReadonlyArray<NavSection>;
  user: { name: string; detail: string; initials: string };
  /** Replaces the preview's "return to sign-in" link, e.g. with a real sign-out button. */
  exitControl?: ReactNode;
  previewNote?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  return (
    <ToastProvider>
      <a className="skip-link" href="#portal-main">
        Skip to main content
      </a>
      <div className={styles.shell}>
        <aside
          id="portal-sidebar"
          className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ''}`}
          aria-label={`${areaLabel} navigation`}
        >
          <div className={styles.brand}>
            <Link href={areaHref} className={styles.brandLink} onClick={() => setNavOpen(false)}>
              <span className={styles.brandMark} aria-hidden="true">
                <Icon name="tree" size={18} />
              </span>
              <span>
                <span className={styles.brandName}>Kulvriksh</span>
                <span className={styles.brandArea}>{areaLabel}</span>
              </span>
            </Link>
            <button
              type="button"
              className={styles.closeNav}
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
            >
              <Icon name="close" />
            </button>
          </div>

          <nav className={styles.nav}>
            {sections.map((section, index) => (
              <div key={section.title ?? index} className={styles.navSection}>
                {section.title ? <p className={styles.navTitle}>{section.title}</p> : null}
                <ul className={styles.navList}>
                  {section.items.map((item) => {
                    const active = isActive(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setNavOpen(false)}
                        >
                          <Icon name={item.icon} size={18} />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className={styles.userCard}>
            <span className={styles.avatar} aria-hidden="true">
              {user.initials}
            </span>
            <span className={styles.userText}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userDetail}>{user.detail}</span>
            </span>
            {exitControl ?? (
              <Link href="/sign-in" className={styles.exitLink} aria-label="Leave preview and return to sign-in">
                <Icon name="logout" size={16} />
              </Link>
            )}
          </div>
        </aside>

        {navOpen ? <div className={styles.scrim} aria-hidden="true" onClick={() => setNavOpen(false)} /> : null}

        <div className={styles.main}>
          <div className={styles.previewBar} role="note">
            <span className={styles.previewLabel}>
              <Icon name="eye" size={14} />
              {previewNote}
            </span>
            {/* No area switcher: each area needs its own sign-in and role (TASK-09). */}
            <nav aria-label="Site" className={styles.previewNav}>
              <Link href="/" className={styles.previewLink}>
                Public site
              </Link>
            </nav>
          </div>
          <header className={styles.topbar}>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setNavOpen(true)}
              aria-expanded={navOpen}
              aria-controls="portal-sidebar"
            >
              <Icon name="menu" />
              <span className="visually-hidden">Open navigation</span>
            </button>
            <span className={styles.topbarArea}>{areaLabel}</span>
          </header>
          <main id="portal-main" tabIndex={-1} className={styles.content}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
