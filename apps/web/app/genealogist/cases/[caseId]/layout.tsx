import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCase } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';

// The assignment check runs in this layout, outside any loading boundary, so an unknown or
// unassigned family returns a real HTTP 404 instead of a streamed "soft" 404 (AS-GEN-04). The API
// makes the same check on every request, so a removed assignment ends access immediately.
export default async function CaseLayout({ children, params }: { children: ReactNode; params: Promise<{ caseId: string }> }) {
  await requireStaff('genealogist');
  const { caseId } = await params;
  const result = await getCase(caseId);
  if (result.kind === 'not_found') {
    notFound();
  }
  if (result.kind !== 'ok') {
    throw new Error('The case could not be loaded');
  }
  return children;
}
