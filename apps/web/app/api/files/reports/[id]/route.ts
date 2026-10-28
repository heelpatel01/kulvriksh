import { proxyDownload } from '@/lib/api/files';

// Customer: a released report's file of their own family only (404 otherwise).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDownload('customer', `/api/v1/reports/${encodeURIComponent(id)}/file`);
}
