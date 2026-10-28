import { proxyUpload } from '@/lib/api/files';

// Customer media upload, streamed to the API (which validates type, size and quota).
export async function POST(request: Request) {
  return proxyUpload('customer', request, '/api/v1/family/media');
}
