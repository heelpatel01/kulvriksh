// Initial administrator bootstrap (F-ADM-00): creates the FIRST admin during deployment.
//   npm run bootstrap:admin -- --email owner@example.com --name "Owner" --confirm
//   node --env-file=.env dist/tools/bootstrap-admin.js --email … --name … --confirm   (production build)
//
// Safe in production:
// - it refuses to run if any active admin already exists (later admins follow R33);
// - it sets NO password: it prints a one-time setup link token, valid for one hour, to this
//   terminal only (never logged, never stored except as a SHA-256 hash). Open
//   <site>/staff/setup#token=<token> and choose a password there;
// - --confirm is required, so it cannot run by accident; there is no HTTP route for it.
import { hashSessionToken, newSessionToken } from '../auth/auth-crypto.ts';
import { ConfigError, loadConfig, type ApiConfig } from '../config.ts';
import { createDatabase } from '../db.ts';
import { normaliseEmail } from '../staff/password.ts';
import { createPrismaStaffLifecycleStore } from '../staff/staff-lifecycle-store.ts';

const BOOTSTRAP_TOKEN_TTL_SECONDS = 3600;

function fail(message: string): never {
  console.error(`bootstrap-admin: ${message}`);
  process.exit(2);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

let config: ApiConfig;
try {
  config = loadConfig();
} catch (err) {
  fail(err instanceof ConfigError ? err.issues.join('; ') : 'invalid configuration');
}
if (!config.databaseUrl) {
  fail('DATABASE_URL is not set');
}
if (!process.argv.includes('--confirm')) {
  fail('add --confirm to create the first administrator');
}
const email = normaliseEmail(arg('email'));
const displayName = arg('name')?.trim();
if (!email) {
  fail('--email must be an email address');
}
if (!displayName || displayName.length > 120) {
  fail('--name is required (at most 120 characters)');
}

const db = createDatabase(config.databaseUrl);
try {
  const store = createPrismaStaffLifecycleStore(db.prisma);
  if ((await store.countActiveAdmins()) > 0) {
    fail('an active administrator already exists; further admins are created according to R33');
  }
  const token = newSessionToken();
  const result = await store.createAccount({
    role: 'admin',
    email,
    displayName,
    tokenHash: hashSessionToken(token),
    ttlSeconds: BOOTSTRAP_TOKEN_TTL_SECONDS,
    actor: { userId: null, role: 'system', requestId: 'bootstrap-admin' },
  });
  if (!result.ok) {
    fail(`an account with ${email} already exists`);
  }
  console.log(`bootstrap-admin: created administrator ${email} (id ${result.userId}) without a password.`);
  console.log(`bootstrap-admin: one-time setup link (valid until ${result.expiresAt.toISOString()}), shown once:`);
  console.log(`  /staff/setup#token=${token}`);
} finally {
  await db.disconnect();
}
