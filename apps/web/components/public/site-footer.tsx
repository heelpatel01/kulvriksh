import Link from 'next/link';
import styles from './site.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerGrid}`}>
        <div>
          <p className={styles.footerBrand}>Kulvriksh</p>
          <p className={styles.footerText}>
            A private digital home for your family history: your family tree, records and voices, with research by
            genealogists.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className={styles.footerHeading}>Explore</p>
          <ul className={styles.footerLinks}>
            <li>
              <Link href="/#how-it-works">How it works</Link>
            </li>
            <li>
              <Link href="/services">Services</Link>
            </li>
            <li>
              <Link href="/surnames">Surnames</Link>
            </li>
            <li>
              <Link href="/enquiry">Contact us</Link>
            </li>
          </ul>
        </nav>
        <div>
          <p className={styles.footerHeading}>Account</p>
          <ul className={styles.footerLinks}>
            <li>
              <Link href="/sign-in">Sign in</Link>
            </li>
          </ul>
          <p className={styles.footerHeading}>Legal</p>
          <p className={styles.footerText}>Privacy policy and terms will be published before launch (roadmap R7).</p>
        </div>
      </div>
      <div className={`container ${styles.footerBottom}`}>
        <p>© Kulvriksh Private Limited. Development build, not a live service.</p>
      </div>
    </footer>
  );
}
