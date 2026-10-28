import { proxyDownload } from '@/lib/api/files';

// Admin review: the API requires the report.review permission.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDownload('staff', `/api/v1/admin/reports/${encodeURIComponent(id)}/file`);
}
