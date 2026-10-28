import type { AdminService, PublicService } from '@kulvriksh/shared';
import { auditInTransaction } from '../audit/audit.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';
import type { ServiceInput, ServicePatch } from './service-validation.ts';

/** Who made a change, for the audit trail. */
export interface ChangeContext {
  actorUserId: string;
  requestId?: string;
}

/** Persistence for services. Routes depend on this interface, not on Prisma. */
export interface ServiceRepository {
  listActive(): Promise<PublicService[]>;
  listAll(): Promise<AdminService[]>;
  create(input: ServiceInput, context: ChangeContext): Promise<AdminService>;
  /** Throws the database's not-found error (P2025) when the id does not exist. */
  update(id: string, patch: ServicePatch, context: ChangeContext): Promise<AdminService>;
}

// Bounded lists: the catalogue is small, but no list is ever unbounded (Product Flows §14.2).
const MAX_ROWS = 200;

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
};

const toAdmin = (row: ServiceRow): AdminService => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export function createPrismaServiceRepository(prisma: PrismaClient): ServiceRepository {
  return {
    async listActive() {
      return prisma.service.findMany({
        where: { status: 'active' },
        select: { id: true, name: true, description: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: MAX_ROWS,
      });
    },
    async listAll() {
      const rows = await prisma.service.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: MAX_ROWS });
      return rows.map(toAdmin);
    },
    async create(input, { actorUserId, requestId }) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.service.create({ data: input });
        await auditInTransaction(tx, {
          actorUserId,
          actorRole: 'admin',
          action: 'service.created',
          targetType: 'service',
          targetId: row.id,
          details: { status: row.status },
          requestId,
        });
        return toAdmin(row);
      });
    },
    async update(id, patch, { actorUserId, requestId }) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.service.update({ where: { id }, data: patch });
        await auditInTransaction(tx, {
          actorUserId,
          actorRole: 'admin',
          action: patch.status === undefined ? 'service.updated' : `service.${patch.status === 'active' ? 'activated' : 'deactivated'}`,
          targetType: 'service',
          targetId: id,
          details: { fields: Object.keys(patch).join(',') },
          requestId,
        });
        return toAdmin(row);
      });
    },
  };
}
