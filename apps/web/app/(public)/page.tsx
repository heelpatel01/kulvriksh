import Link from 'next/link';
import { TreeIllustration } from '@/components/public/tree-illustration';
import { ButtonLink } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { fetchPublicServices, PUBLIC_SERVICES_TAG } from '@/lib/api/public-services';
import styles from './home.module.css';

const PRINCIPLES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'lock',
    title: 'Private by default',
    body: 'Your family workspace belongs to you. It is not public, and it is not shared unless access is granted.',
  },
  {
    icon: 'shield',
    title: 'Access only by assignment',
    body: 'A genealogist can see a family only after our team assigns them to it, and only for that assignment.',
  },
  {
    icon: 'check',
    title: 'Reviewed before release',
    body: 'Research reports are reviewed by our team before they are released to you.',
  },
  {
    icon: 'card',
    title: 'Verified payments',
    body: 'Payments are processed by Razorpay and verified on our servers before anything is unlocked.',
  },
];

const STEPS = [
  {
    title: 'Create your family workspace',
    body: 'Sign in with your mobile number and open a private workspace for your family.',
  },
  {
    title: 'Add the people you know',
    body: 'Record family members and how they are related. The tree grows as you add them.',
  },
  {
    title: 'Keep photographs, documents and voices',
    body: 'Attach photographs, certificates, letters and recorded stories to the people they belong to.',
  },
  {
    title: 'Commission research when you are ready',
    body: 'A genealogist assigned to your family researches further back and prepares a reviewed report.',
  },
];

const TREE_FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'tree', title: 'An interactive family tree', body: 'Move through generations, open a person and see everything recorded about them.' },
  { icon: 'users', title: 'Members and relationships', body: 'Record how family members are related, with checks that prevent impossible relationships.' },
  { icon: 'image', title: 'Photographs and documents', body: 'Private uploads, visible only to you and the people you allow.' },
  { icon: 'mic', title: 'Voices and narration', body: 'Keep recorded stories, or turn written memories into narrated audio.' },
  { icon: 'download', title: 'PDF export', body: 'Download your family tree as a PDF to print or share with relatives.' },
];

const RESEARCH_STEPS = [
  { title: 'Assignment', body: 'Our team assigns a genealogist or Vahivancha with knowledge of your family’s region.' },
  { title: 'Research', body: 'They study registers, records and family accounts, and keep notes and sources.' },
  { title: 'Review', body: 'The report is reviewed by our team and returned for changes if needed.' },
  { title: 'Release', body: 'Once approved, the report is released to your workspace to read and download.' },
];

export default async function HomePage() {
  // The real, active catalogue (same cached read as /services); at most four are featured here.
  const catalogue = await fetchPublicServices({ baseUrl: process.env.API_INTERNAL_URL, init: { next: { revalidate: 60, tags: [PUBLIC_SERVICES_TAG] } } });
  const services = catalogue.kind === 'ok' ? catalogue.services.slice(0, 4) : [];

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={`container ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <p className={styles.kicker}>Kul · family &nbsp;·&nbsp; Vriksh · tree</p>
            <h1 id="hero-title" className={styles.heroTitle}>
              Every family has a story. Keep yours together.
            </h1>
            <p className={styles.heroLead}>
              Kulvriksh is a private digital home for your family history. Build your family tree, keep photographs,
              documents and voices with the people they belong to, and commission research by genealogists who know
              your region.
            </p>
            <div className={styles.heroActions}>
              <ButtonLink href="/sign-in" size="lg" icon="arrowRight" iconPosition="end">
                Start your family tree
              </ButtonLink>
              <ButtonLink href="/services" size="lg" variant="secondary">
                Explore research services
              </ButtonLink>
            </div>
            <p className={styles.heroNote}>
              <Icon name="info" size={16} />
              The platform is in development. This preview uses sample content.
            </p>
          </div>
          <figure className={styles.heroVisual}>
            <div className={styles.heroCard}>
              <div className={styles.heroCardHeader}>
                <span className={styles.dot} aria-hidden="true" />
                <span>Mehta family · sample tree</span>
              </div>
              <TreeIllustration className={styles.treeSvg} />
            </div>
            <figcaption className="visually-hidden">A sample family tree across three generations.</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.principles} aria-label="How we look after your family history">
        <div className={`container ${styles.principleGrid}`}>
          {PRINCIPLES.map((principle) => (
            <div key={principle.title} className={styles.principle}>
              <span className={styles.principleIcon}>
                <Icon name={principle.icon} size={20} />
              </span>
              <div>
                <h2 className={styles.principleTitle}>{principle.title}</h2>
                <p className={styles.principleBody}>{principle.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className={styles.section} aria-labelledby="how-title">
        <div className="container">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 id="how-title" className={styles.sectionTitle}>
              From the names you remember to a family history you can pass on
            </h2>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="tree-title">
        <div className={`container ${styles.split}`}>
          <div>
            <p className={styles.eyebrow}>Your family workspace</p>
            <h2 id="tree-title" className={styles.sectionTitle}>
              A family tree that holds more than names
            </h2>
            <p className={styles.sectionLead}>
              Each person in your tree can carry their dates, places, photographs, documents and recorded voices, so
              the stories stay with the people they belong to.
            </p>
            <ButtonLink href="/sign-in" variant="secondary" icon="arrowRight" iconPosition="end">
              Preview the workspace
            </ButtonLink>
          </div>
          <ul className={styles.featureList}>
            {TREE_FEATURES.map((feature) => (
              <li key={feature.title} className={styles.feature}>
                <span className={styles.featureIcon}>
                  <Icon name={feature.icon} size={18} />
                </span>
                <div>
                  <h3 className={styles.featureTitle}>{feature.title}</h3>
                  <p className={styles.featureBody}>{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="research-title">
        <div className="container">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Genealogy research</p>
            <h2 id="research-title" className={styles.sectionTitle}>
              Research by genealogists who know your region
            </h2>
            <p className={styles.sectionLead}>
              Many families’ histories are kept in community registers maintained by Vahivancha record keepers, and in
              civil and personal records. Our genealogists work with these sources on your behalf.
            </p>
          </div>
          <ol className={styles.timeline}>
            {RESEARCH_STEPS.map((step, index) => (
              <li key={step.title} className={styles.timelineItem}>
                <span className={styles.timelineMarker} aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="services-title">
        <div className="container">
          <div className={styles.sectionHeadRow}>
            <div>
              <p className={styles.eyebrow}>Services</p>
              <h2 id="services-title" className={styles.sectionTitle}>
                Choose what your family needs
              </h2>
            </div>
            <Link href="/services" className={styles.textLink}>
              All services <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          {services.length === 0 ? (
            <p className={styles.sectionLead}>
              Our services are listed on the <Link href="/services">services page</Link>.
            </p>
          ) : null}
          <div className={styles.serviceGrid}>
            {services.map((service) => (
              <article key={service.id} className={styles.serviceCard}>
                <span className={styles.serviceIcon}>
                  <Icon name="briefcase" size={22} />
                </span>
                <h3 className={styles.serviceTitle}>{service.name}</h3>
                <p className={styles.serviceBody}>{service.description}</p>
                <Link href="/services" className={styles.textLink}>
                  Learn more <Icon name="arrowRight" size={16} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="surnames-title">
        <div className={`container ${styles.surnameBand}`}>
          <div>
            <p className={styles.eyebrow}>Surnames</p>
            <h2 id="surnames-title" className={styles.sectionTitle}>
              Start with your family name
            </h2>
            <p className={styles.sectionLead}>
              Read about the history of your surname and see how other families have begun their research.
            </p>
          </div>
          <ButtonLink href="/surnames" variant="secondary" icon="arrowRight" iconPosition="end">
            Browse surnames
          </ButtonLink>
        </div>
      </section>

      <section className={styles.cta} aria-labelledby="cta-title">
        <div className={`container ${styles.ctaInner}`}>
          <h2 id="cta-title" className={styles.ctaTitle}>
            Begin your family’s history today
          </h2>
          <p className={styles.ctaLead}>Start with the names you know. You can add more, and ask for research, at any time.</p>
          <div className={styles.heroActions}>
            <ButtonLink href="/sign-in" size="lg">
              Start your family tree
            </ButtonLink>
            <ButtonLink href="/enquiry" size="lg" variant="secondary">
              Ask us a question
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
