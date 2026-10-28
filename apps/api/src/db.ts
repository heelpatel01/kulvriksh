import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import type { DatabaseProbe } from './readiness.ts';

export interface Database {
  prisma: PrismaClient;
  probe: DatabaseProbe;
  disconnect(): Promise<void>;
}

/**
 * Creates the API's single shared database client (one per process). It connects lazily, so
 * startup does not fail when PostgreSQL is down: readiness reports it instead. The connection
 * string holds a credential; it is passed straight to the driver and never logged.
 */
export function createDatabase(connectionString: string): Database {
  const adapter = new PrismaPg({
    connectionString,
    max: 5, // small pool: the production VPS has 1 vCPU and shares PostgreSQL with Next.js
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30_000,
    // The adapter sends JavaScript dates without a UTC offset, so PostgreSQL reads them in the
    // session time zone. Pinning the session to UTC stores them correctly whatever the server's
    // own zone is (found in TASK-09: the local cluster runs in Asia/Kolkata and dates were 5.5 h off).
    options: '-c TimeZone=UTC',
  });
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    probe: {
      async ping() {
        await prisma.$queryRaw`SELECT 1`;
      },
    },
    disconnect: () => prisma.$disconnect(),
  };
}
