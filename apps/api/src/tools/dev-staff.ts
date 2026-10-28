// DEVELOPMENT ONLY: create a test staff account for the local demo.
//   npm run dev:staff -- --role genealogist --email asha.g@example.test --name "Asha (test genealogist)"
//   npm run dev:staff -- --role admin --email admin@example.test --name "Local admin"
//
// Guards: it runs only when apps/api/.env sets DEV_STAFF_PROVISIONING=1, which the configuration
// refuses unless NODE_ENV=development (so a production configuration fails to load); the database
// must be on loopback (enforced by the configuration outside production); and this file is
// excluded from the production build (tsconfig.build.json). There is no HTTP route for it.
// The role is never defaulted: admin rights are granted only when --role admin is typed.
//
// The password comes from DEV_STAFF_PASSWORD, or is generated and printed once to this terminal.
// It is never logged or stored anywhere except as a scrypt hash.
import { randomBytes } from 'node:crypto';
import { ConfigError, loadConfig, type ApiConfig } from '../config.ts';
import { createDatabase } from '../db.ts';
import { isUniqueViolation } from '../db-errors.ts';
import { hashPassword, normaliseEmail, passwordProblem } from '../staff/password.ts';
import { createPrismaStaffStore } from '../staff/staff-store.ts';

function fail(message: string): never {
  console.error(`dev-staff: ${message}`);
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
if (config.nodeEnv !== 'development' || !config.devStaffProvisioning) {
  fail('disabled. Set DEV_STAFF_PROVISIONING=1 in apps/api/.env (allowed only with NODE_ENV=development).');
}
if (!config.databaseUrl) {
  fail('DATABASE_URL is not set');
}

const role = arg('role');
if (role !== 'genealogist' && role !== 'admin') {
  fail('--role must be genealogist or admin');
}
const email = normaliseEmail(arg('email'));
if (!email) {
  fail('--email must be an email address');
}
const displayName = arg('name')?.trim();
if (!displayName || displayName.length > 120) {
  fail('--name is required (at most 120 characters)');
}
const supplied = process.env.DEV_STAFF_PASSWORD;
const password = supplied ?? randomBytes(15).toString('base64url');
const problem = passwordProblem(password);
if (problem) {
  fail(`DEV_STAFF_PASSWORD: ${problem}`);
}

const db = createDatabase(config.databaseUrl);
try {
  const id = await createPrismaStaffStore(db.prisma).createStaff({ role, email, displayName, passwordHash: await hashPassword(password) });
  console.log(`dev-staff: created ${role} ${email} (id ${id})`);
  if (!supplied) {
    console.log(`dev-staff: password (shown once, development only): ${password}`);
  }
} catch (err) {
  fail(isUniqueViolation(err) ? `an account with ${email} already exists` : 'could not create the account');
} finally {
  await db.disconnect();
}
