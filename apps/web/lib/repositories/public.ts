// Public surname pages: static sample content until the 25 surnames and their content source are
// decided (R2). The service catalogue is read from the API (lib/api/public-services.ts).
import { SURNAME_PAGES } from '@/lib/sample-data/surnames';

export async function getPublishedSurnames() {
  return SURNAME_PAGES.filter((page) => page.status === 'published').map((page) => ({
    slug: page.slug,
    surname: page.surname,
    metaDescription: page.metaDescription,
  }));
}

export async function getSurnamePage(slug: string) {
  const page = SURNAME_PAGES.find((candidate) => candidate.slug === slug && candidate.status === 'published');
  return page ? { slug: page.slug, surname: page.surname, metaDescription: page.metaDescription } : null;
}
