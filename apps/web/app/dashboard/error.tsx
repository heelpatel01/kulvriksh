'use client';

import { PortalError } from '@/components/portal/portal-error';

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && 'digest' in error ? String(error.digest) : undefined;
  return <PortalError retry={retry} homeHref="/dashboard" digest={digest} />;
}
