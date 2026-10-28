// Server-side only. Service catalogue calls to the Express API, made with the signed-in admin's
// session (mirrors AdminService in packages/shared).
import { staffApi } from './session-api';

export type ServiceStatus = 'active' | 'inactive';

export interface AdminService {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInput {
  name: string;
  description: string;
  status: ServiceStatus;
}

export function listAdminServices() {
  return staffApi<{ services: AdminService[] }>('/api/v1/admin/services');
}

export function createService(input: ServiceInput) {
  return staffApi<{ service: AdminService }>('/api/v1/admin/services', { method: 'POST', body: input });
}

export function updateService(id: string, patch: Partial<ServiceInput>) {
  return staffApi<{ service: AdminService }>(`/api/v1/admin/services/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}
