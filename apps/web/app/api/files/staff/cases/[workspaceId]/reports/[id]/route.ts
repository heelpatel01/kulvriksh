import { proxyDownload, proxyUpload } from '@/lib/api/files';

type Params = { params: Promise<{ workspaceId: string; id: string }> };
const path = async ({ params }: Params) => {
  const { workspaceId, id } = await params;
  return `/api/v1/genealogist/cases/${encodeURIComponent(workspaceId)}/reports/${encodeURIComponent(id)}/file`;
};

// Genealogist: the API checks the role and the current assignment on both requests.
export async function GET(_request: Request, context: Params) {
  return proxyDownload('staff', await path(context));
}

export async function POST(request: Request, context: Params) {
  return proxyUpload('staff', request, await path(context));
}
