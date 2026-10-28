// MOCK ADAPTER, kept only for the surname-pages screen, which stays sample until the 25 surnames
// and their content source are decided (R2; the data model leaves surname content unmodelled).
// Every other admin screen reads the API (TASK-11/TASK-12).
import { formatDate } from '@/lib/format';
import { PLANNED_SURNAME_PAGE_COUNT, SURNAME_PAGES } from '@/lib/sample-data/surnames';

export async function getSurnamePages() {
  return {
    planned: PLANNED_SURNAME_PAGE_COUNT,
    pages: SURNAME_PAGES.map((page) => ({ ...page, updatedLabel: formatDate(page.updatedAt) })),
  };
}
export type SurnamePageRow = Awaited<ReturnType<typeof getSurnamePages>>['pages'][number];
