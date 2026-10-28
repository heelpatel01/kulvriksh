// SAMPLE DATA. The 25 surnames and the source and ownership of their page content are TBC
// (roadmap R2). These entries only demonstrate the page structure and the admin workflow.

export interface SampleSurnamePage {
  slug: string;
  surname: string;
  status: 'published' | 'draft' | 'awaiting_content';
  metaDescription: string;
  updatedAt: string;
}

export const SURNAME_PAGES: SampleSurnamePage[] = [
  { slug: 'mehta', surname: 'Mehta', status: 'published', metaDescription: 'Explore Mehta family history and start a private Mehta family tree with Kulvriksh.', updatedAt: '2026-10-12T10:00:00+05:30' },
  { slug: 'desai', surname: 'Desai', status: 'published', metaDescription: 'Explore Desai family history and start a private Desai family tree with Kulvriksh.', updatedAt: '2026-10-12T10:00:00+05:30' },
  { slug: 'joshi', surname: 'Joshi', status: 'published', metaDescription: 'Explore Joshi family history and start a private Joshi family tree with Kulvriksh.', updatedAt: '2026-10-12T10:00:00+05:30' },
  { slug: 'patel', surname: 'Patel', status: 'draft', metaDescription: 'Explore Patel family history and start a private Patel family tree with Kulvriksh.', updatedAt: '2026-10-18T10:00:00+05:30' },
  { slug: 'shah', surname: 'Shah', status: 'draft', metaDescription: 'Explore Shah family history and start a private Shah family tree with Kulvriksh.', updatedAt: '2026-10-18T10:00:00+05:30' },
  { slug: 'trivedi', surname: 'Trivedi', status: 'awaiting_content', metaDescription: '', updatedAt: '2026-10-01T10:00:00+05:30' },
  { slug: 'bhatt', surname: 'Bhatt', status: 'awaiting_content', metaDescription: '', updatedAt: '2026-10-01T10:00:00+05:30' },
  { slug: 'parekh', surname: 'Parekh', status: 'awaiting_content', metaDescription: '', updatedAt: '2026-10-01T10:00:00+05:30' },
];

export const PLANNED_SURNAME_PAGE_COUNT = 25;
