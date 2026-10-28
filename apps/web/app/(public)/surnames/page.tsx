import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { getPublishedSurnames } from '@/lib/repositories/public';
import styles from '../pages.module.css';

export const metadata: Metadata = {
  title: 'Surnames',
  description: 'Explore family surnames and begin your own family history with Kulvriksh.',
  alternates: { canonical: '/surnames' },
};

export default async function SurnamesPage() {
  const surnames = await getPublishedSurnames();

  return (
    <>
      <section className={styles.pageHero}>
        <div className="container">
          <p className={styles.eyebrow}>Surnames</p>
          <h1 className={styles.title}>Explore family surnames</h1>
          <p className={styles.lead}>Each surname page introduces a family name and how to begin researching it.</p>
        </div>
      </section>
      <div className={`container ${styles.body}`}>
        <div className={styles.stack}>
          <Notice tone="info" title="More surnames are coming">
            Twenty-five surname pages are planned. The surnames and their content are still being prepared, so only a
            few sample pages are shown here.
          </Notice>
          <div className={styles.cardGrid}>
            {surnames.map((surname) => (
              <Link key={surname.slug} href={`/surnames/${surname.slug}`} className={styles.surnameCard}>
                <span className={styles.surnameName}>{surname.surname}</span>
                <span className={styles.surnameMeta}>{surname.metaDescription}</span>
                <Icon name="arrowRight" size={16} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
