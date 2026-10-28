'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '../ui/icon';
import styles from './site.module.css';

const LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/services', label: 'Services' },
  { href: '/surnames', label: 'Surnames' },
  { href: '/enquiry', label: 'Contact' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Link href="/" className={styles.wordmark} onClick={() => setOpen(false)}>
          <span className={styles.wordmarkIcon} aria-hidden="true">
            <Icon name="tree" size={18} />
          </span>
          Kulvriksh
        </Link>

        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'close' : 'menu'} />
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
        </button>

        <nav id="site-nav" aria-label="Main" className={`${styles.nav} ${open ? styles.navOpen : ''}`}>
          <ul className={styles.navList}>
            {LINKS.map((link) => {
              const active = !link.href.includes('#') && (pathname === link.href || pathname.startsWith(`${link.href}/`));
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={styles.navLink}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/sign-in" className={styles.signIn} onClick={() => setOpen(false)}>
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
