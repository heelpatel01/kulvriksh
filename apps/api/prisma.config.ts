// Prisma CLI configuration (generate and migrate). Migrations always run as the owner role
// (MIGRATION_DATABASE_URL); the running API uses the least-privilege runtime role
// (DATABASE_URL) and never this configuration. See docs/02-DATA-MODEL.md §9.7.
import { defineConfig } from 'prisma/config';

// Load apps/api/.env when it exists (Node's built-in loader; existing variables win).
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the environment. `prisma generate` needs no database.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL ?? '',
    // A dedicated, owner-only database that `prisma migrate dev` may reset when creating migrations.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
