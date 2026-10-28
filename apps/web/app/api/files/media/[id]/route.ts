import { proxyDownload } from '@/lib/api/files';

// Customer media content: the API checks that the file belongs to the signed-in customer.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDownload('customer', `/api/v1/family/media/${encodeURIComponent(id)}/content`);
}
