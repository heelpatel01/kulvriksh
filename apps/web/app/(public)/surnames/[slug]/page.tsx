import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/primitives';
import { getPublishedSurnames, getSurnamePage } from '@/lib/repositories/public';
import styles from '../../pages.module.css';

// Surname pages are generated at build time. Unknown slugs return a real 404 (AS-PUB-05).
export const dynamicParams = false;

export async function generateStaticParams() {
  const surnames = await getPublishedSurnames();
  return surnames.map((surname) => ({ slug: surname.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getSurnamePage(slug);
  if (!page) {
    return {};
  }
  return {
    title: `${page.surname} family history`,
    description: page.metaDescription,
    alternates: { canonical: `/surnames/${page.slug}` },
  };
}

export default async function SurnamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getSurnamePage(slug);
  if (!page) {
    notFound();
  }

  return (
    <>
      <section className={styles.pageHero}>
        <div className="container">
          <p className={styles.eyebrow}>
            <Link href="/surnames">Surnames</Link> / {page.surname}
          </p>
          <h1 className={styles.title}>The {page.surname} family</h1>
          <p className={styles.lead}>{page.metaDescription}</p>
        </div>
      </section>
      <div className={`container ${styles.body}`}>
        <article className={styles.prose}>
          <Notice tone="warning" title="Sample page">
            This page shows the layout of a surname page. Its historical content will be supplied by Kulvriksh before
            launch, so no history is shown here yet.
          </Notice>
          <h2>About the {page.surname} surname</h2>
          <p>
            This section will describe the origins of the {page.surname} name, the regions and communities where it is
            found, and the records that can help families trace it.
          </p>
          <h2>Researching a {page.surname} family</h2>
          <p>
            Start by recording the family members you know in a private workspace. When you are ready, a genealogist with
            knowledge of your family’s region can research further back and prepare a reviewed report.
          </p>
          <div className={styles.ctaRow}>
            <ButtonLink href="/sign-in">Start your family tree</ButtonLink>
            <ButtonLink href="/services" variant="secondary">
              About research
            </ButtonLink>
          </div>
        </article>
      </div>
    </>
  );
}
