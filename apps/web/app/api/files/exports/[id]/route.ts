import { proxyDownload } from '@/lib/api/files';

// A family tree PDF: the API checks that the export belongs to the signed-in customer and has not
// expired; anything else is a plain 404.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'File not found.' } }, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  return proxyDownload('customer', `/api/v1/family/exports/${id}/file`);
}
