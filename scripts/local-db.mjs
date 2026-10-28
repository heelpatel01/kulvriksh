#!/usr/bin/env node
// Local PostgreSQL for development: a project-local instance in .data/postgres (git-ignored),
// listening on 127.0.0.1:5434 only. No Windows service, no admin rights, no global changes.
//
//   node scripts/local-db.mjs init     create the cluster, roles, databases and env files (once)
//   node scripts/local-db.mjs start    start the server
//   node scripts/local-db.mjs stop     stop the server
//   node scripts/local-db.mjs status   show whether it is running
//   node scripts/local-db.mjs migrate  apply Prisma migrations to the dev and test databases
//   node scripts/local-db.mjs secrets  add settings introduced after init (sign-in keys) to apps/api/.env
//
// Secrets: passwords are generated here and written only to git-ignored files
// (apps/api/.env, apps/web/.env.local, .data/postgres/superuser.pw). They are never printed,
// never passed on a command line, and SQL containing them goes to psql on stdin.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const ROOT = resolve(import.meta.dirname, '..');
const PG_HOME = join(ROOT, '.data', 'postgres');
const BIN = join(PG_HOME, 'pgsql', 'bin');
const DATA = join(PG_HOME, 'data');
const LOG = join(PG_HOME, 'postgres.log');
const SUPERUSER_PW_FILE = join(PG_HOME, 'superuser.pw');
const API_DIR = join(ROOT, 'apps', 'api');
const API_ENV = join(API_DIR, '.env');
const WEB_ENV = join(ROOT, 'apps', 'web', '.env.local');
const PRISMA_CLI = join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');

const HOST = '127.0.0.1';
const PORT = 5434;
const API_PORT = 4100;
// Role split from docs/02-DATA-MODEL.md §9.7 (names indicative).
const OWNER = 'kulvriksh_owner';
const APP = 'kulvriksh_app';
const DB = { main: 'kulvriksh', test: 'kulvriksh_test', shadow: 'kulvriksh_shadow' };

const exe = (name) => join(BIN, process.platform === 'win32' ? `${name}.exe` : name);
const secret = () => randomBytes(24).toString('base64url');
const url = (user, password, database) => `postgresql://${user}:${password}@${HOST}:${PORT}/${database}`;

function fail(message) {
  console.error(`local-db: ${message}`);
  process.exit(1);
}

/** Runs a program; output is shown only for commands that print no secrets. */
function run(file, args, { env, input, quiet = false, allowFailure = false, cwd, detached = false } = {}) {
  const result = spawnSync(file, args, {
    cwd,
    input,
    env: { ...process.env, ...env },
    // `detached`: the server started by pg_ctl must not inherit our pipes, or this call would
    // wait until the server exits.
    stdio: detached
      ? 'ignore'
      : [input === undefined ? 'ignore' : 'pipe', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'],
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    fail(`could not run ${file}: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    fail(`${file.split(/[\\/]/).pop()} exited with code ${result.status}`);
  }
  return result;
}

/** Runs SQL from stdin. The password travels in PGPASSWORD, never on the command line. */
function psql(user, password, database, sql) {
  run(exe('psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', HOST, '-p', String(PORT), '-U', user, '-d', database, '-f', '-'], {
    env: { PGPASSWORD: password },
    input: sql,
    quiet: true,
  });
}

function isRunning() {
  return run(exe('pg_ctl'), ['status', '-D', DATA], { quiet: true, allowFailure: true }).status === 0;
}

function requireBinaries() {
  if (!existsSync(exe('pg_ctl'))) {
    fail(
      `PostgreSQL binaries not found in ${BIN}.\n` +
        'Download the PostgreSQL 18 Windows x64 binaries zip from EnterpriseDB and extract it so that\n' +
        '.data/postgres/pgsql/bin/pg_ctl.exe exists, then run this command again.',
    );
  }
}

function start() {
  requireBinaries();
  if (!existsSync(DATA)) {
    fail('no database cluster yet; run "npm run db:init" first');
  }
  if (isRunning()) {
    console.log(`local-db: already running on ${HOST}:${PORT}`);
    return;
  }
  run(exe('pg_ctl'), ['start', '-D', DATA, '-l', LOG, '-w', '-t', '60'], { detached: true });
  console.log(`local-db: started on ${HOST}:${PORT} (log: .data/postgres/postgres.log)`);
}

function stop() {
  requireBinaries();
  if (!existsSync(DATA) || !isRunning()) {
    console.log('local-db: not running');
    return;
  }
  run(exe('pg_ctl'), ['stop', '-D', DATA, '-m', 'fast', '-w'], { quiet: true });
  console.log('local-db: stopped');
}

function status() {
  requireBinaries();
  const running = existsSync(DATA) && isRunning();
  console.log(`local-db: ${running ? 'running' : 'not running'} (cluster ${existsSync(DATA) ? 'present' : 'not created'}; ${HOST}:${PORT})`);
  if (running) {
    const ready = run(exe('pg_isready'), ['-h', HOST, '-p', String(PORT)], { quiet: true, allowFailure: true });
    console.log(`local-db: pg_isready exit code ${ready.status} (0 = accepting connections)`);
  }
}

function provisionSql(passwords) {
  const perDatabase = (database, withApp) => `
\\connect ${database}
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO ${OWNER};
${
  withApp
    ? `GRANT USAGE ON SCHEMA public TO ${APP};
ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP};
ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP};`
    : ''
}`;
  return `
CREATE ROLE ${OWNER} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${passwords.owner}';
CREATE ROLE ${APP} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${passwords.app}';
ALTER ROLE ${APP} SET statement_timeout = '5s';
ALTER ROLE ${APP} SET idle_in_transaction_session_timeout = '30s';
CREATE DATABASE ${DB.main} OWNER ${OWNER} ENCODING 'UTF8';
CREATE DATABASE ${DB.test} OWNER ${OWNER} ENCODING 'UTF8';
CREATE DATABASE ${DB.shadow} OWNER ${OWNER} ENCODING 'UTF8';
REVOKE ALL ON DATABASE ${DB.main}, ${DB.test}, ${DB.shadow} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${DB.main}, ${DB.test} TO ${APP};
${perDatabase(DB.main, true)}
${perDatabase(DB.test, true)}
${perDatabase(DB.shadow, false)}
`;
}

function init() {
  requireBinaries();
  for (const [path, label] of [
    [DATA, '.data/postgres/data'],
    [API_ENV, 'apps/api/.env'],
    [WEB_ENV, 'apps/web/.env.local'],
  ]) {
    if (existsSync(path)) {
      fail(`${label} already exists; init never overwrites it. Move it aside yourself if you want a fresh setup.`);
    }
  }
  const passwords = { superuser: secret(), owner: secret(), app: secret() };
  const adminPreviewToken = secret();

  mkdirSync(PG_HOME, { recursive: true });
  writeFileSync(SUPERUSER_PW_FILE, `${passwords.superuser}\n`, { mode: 0o600 });
  run(
    exe('initdb'),
    ['-D', DATA, '-U', 'postgres', `--pwfile=${SUPERUSER_PW_FILE}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--locale=C', '--no-instructions'],
    { quiet: true },
  );
  // Loopback only, fixed port (5433 belongs to another project on this machine).
  appendFileSync(
    join(DATA, 'postgresql.conf'),
    `\n# Kulvriksh local development (scripts/local-db.mjs)\nlisten_addresses = '${HOST}'\nport = ${PORT}\npassword_encryption = 'scram-sha-256'\n`,
  );
  start();
  psql('postgres', passwords.superuser, 'postgres', provisionSql(passwords));

  writeFileSync(
    API_ENV,
    [
      '# Local development settings written by scripts/local-db.mjs.',
      '# Contains secrets: git-ignored, never commit, never paste into reports or chats.',
      'NODE_ENV=development',
      `API_HOST=${HOST}`,
      `API_PORT=${API_PORT}`,
      'LOG_LEVEL=info',
      `DATABASE_URL=${url(APP, passwords.app, DB.main)}`,
      `MIGRATION_DATABASE_URL=${url(OWNER, passwords.owner, DB.main)}`,
      `SHADOW_DATABASE_URL=${url(OWNER, passwords.owner, DB.shadow)}`,
      `TEST_DATABASE_URL=${url(APP, passwords.app, DB.test)}`,
      `TEST_MIGRATION_DATABASE_URL=${url(OWNER, passwords.owner, DB.test)}`,
      `ADMIN_PREVIEW_TOKEN=${adminPreviewToken}`,
      ...signInLines(),
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  writeFileSync(
    WEB_ENV,
    [
      '# Local development settings written by scripts/local-db.mjs. Git-ignored; never commit.',
      `API_INTERNAL_URL=http://${HOST}:${API_PORT}`,
      '# Must match ADMIN_PREVIEW_TOKEN in apps/api/.env (development preview only; not authentication).',
      `ADMIN_PREVIEW_TOKEN=${adminPreviewToken}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.log('local-db: created roles kulvriksh_owner and kulvriksh_app, databases kulvriksh, kulvriksh_test, kulvriksh_shadow');
  console.log('local-db: wrote apps/api/.env and apps/web/.env.local (git-ignored; they contain the generated secrets)');
  migrate();
}

/** Customer sign-in settings for local development: two separate HMAC keys and the dev outbox. */
function signInLines() {
  return [
    '# Customer sign-in (development). Separate HMAC keys for OTP hashes and rate-limit keys.',
    '# OTP_DELIVERY=development keeps codes in API memory for the local sign-in page; it is refused',
    '# outside NODE_ENV=development. No SMS provider is configured.',
    `OTP_HMAC_KEY=${secret()}${secret()}`,
    `RATE_LIMIT_HMAC_KEY=${secret()}${secret()}`,
    'OTP_DELIVERY=development',
    '# Encrypts staff TOTP secrets (two-step sign-in, TASK-10). Different from the HMAC keys.',
    `STAFF_MFA_KEY=${secret()}${secret()}`,
  ];
}

/** Adds settings introduced after `init` to an existing apps/api/.env. Values are never printed. */
function secrets() {
  const env = readApiEnv();
  const missing = ['OTP_HMAC_KEY', 'RATE_LIMIT_HMAC_KEY', 'OTP_DELIVERY', 'STAFF_MFA_KEY'].filter((name) => !env[name]);
  if (missing.length === 0) {
    console.log('local-db: apps/api/.env already has the sign-in settings; nothing changed');
    return;
  }
  const lines = signInLines().filter((line) => line.startsWith('#') || missing.some((name) => line.startsWith(`${name}=`)));
  appendFileSync(API_ENV, `\n${lines.join('\n')}\n`);
  console.log(`local-db: added ${missing.join(', ')} to apps/api/.env (values not shown)`);
}

function readApiEnv() {
  if (!existsSync(API_ENV)) {
    fail('apps/api/.env not found; run "npm run db:init" first');
  }
  return parseEnv(readFileSync(API_ENV, 'utf8'));
}

function migrate() {
  requireBinaries();
  if (!isRunning()) {
    fail('the database is not running; run "npm run db:start" first');
  }
  const env = readApiEnv();
  const migrationsDir = join(API_DIR, 'prisma', 'migrations');
  if (!existsSync(migrationsDir)) {
    console.log('local-db: no migrations yet (apps/api/prisma/migrations); nothing to apply');
    return;
  }
  for (const [label, ownerUrl] of [
    ['development', env.MIGRATION_DATABASE_URL],
    ['test', env.TEST_MIGRATION_DATABASE_URL],
  ]) {
    if (!ownerUrl) {
      fail(`missing ${label} migration URL in apps/api/.env`);
    }
    console.log(`local-db: applying migrations to the ${label} database`);
    run(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], { cwd: API_DIR, env: { MIGRATION_DATABASE_URL: ownerUrl } });
    // The runtime role must never touch migration history (default privileges granted it DML).
    const parsed = new URL(ownerUrl);
    psql(
      decodeURIComponent(parsed.username),
      decodeURIComponent(parsed.password),
      parsed.pathname.slice(1),
      `REVOKE ALL ON TABLE public."_prisma_migrations" FROM ${APP};`,
    );
  }
  console.log('local-db: migrations applied; kulvriksh_app has no access to _prisma_migrations');
}

const BACKUP_DIR = join(ROOT, '.data', 'backups');
const RESTORE_CHECK_DB = 'kulvriksh_restore_check';

/** Runs one query and returns its unaligned output. */
function query(user, password, database, sql) {
  return run(exe('psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', HOST, '-p', String(PORT), '-U', user, '-d', database, '-f', '-'], {
    env: { PGPASSWORD: password },
    input: sql,
    quiet: true,
  }).stdout.trim();
}

function ownerOf(urlText) {
  const parsed = new URL(urlText);
  return { user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: parsed.pathname.slice(1) };
}

/** Per-table row counts and applied migrations: what a restore must reproduce. */
function fingerprint(user, password, database) {
  const tables = query(user, password, database, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;").split(String.fromCharCode(10)).map((t) => t.trim()).filter(Boolean);
  const counts = {};
  for (const table of tables) {
    counts[table] = Number(query(user, password, database, `SELECT count(*) FROM public."${table}";`));
  }
  return counts;
}

/**
 * Backs up the development database (custom-format pg_dump, as the owner role) to .data/backups/.
 * The production backup schedule, storage and retention are Phase 10 decisions; this proves the
 * procedure works on this cluster.
 */
function backup() {
  requireBinaries();
  if (!isRunning()) {
    fail('the database is not running; run "npm run db:start" first');
  }
  const owner = ownerOf(readApiEnv().MIGRATION_DATABASE_URL ?? fail('missing MIGRATION_DATABASE_URL'));
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, `${owner.database}-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
  run(exe('pg_dump'), ['-h', HOST, '-p', String(PORT), '-U', owner.user, '-d', owner.database, '-Fc', '-f', file], { env: { PGPASSWORD: owner.password }, quiet: true });
  console.log(`local-db: backup written to ${file} (${statSync(file).size} bytes)`);
  return file;
}

/**
 * Restores the newest backup (or the file given) into a temporary database on the same cluster,
 * checks that every table and row count matches the source database, then drops the temporary
 * database. Nothing in the source database is changed.
 */
function restoreCheck() {
  requireBinaries();
  if (!isRunning()) {
    fail('the database is not running; run "npm run db:start" first');
  }
  const owner = ownerOf(readApiEnv().MIGRATION_DATABASE_URL ?? fail('missing MIGRATION_DATABASE_URL'));
  const file =
    process.argv[3] ??
    (existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR).filter((n) => n.endsWith('.dump')).sort().map((n) => join(BACKUP_DIR, n)).pop() : undefined);
  if (!file || !existsSync(file)) {
    fail('no backup found; run "npm run db:backup" first');
  }
  const superPw = readFileSync(SUPERUSER_PW_FILE, 'utf8').trim();
  psql('postgres', superPw, 'postgres', `DROP DATABASE IF EXISTS ${RESTORE_CHECK_DB};
CREATE DATABASE ${RESTORE_CHECK_DB} OWNER ${OWNER};`);
  try {
    run(exe('pg_restore'), ['-h', HOST, '-p', String(PORT), '-U', owner.user, '-d', RESTORE_CHECK_DB, '--no-owner', '--exit-on-error', file], { env: { PGPASSWORD: owner.password }, quiet: true });
    const source = fingerprint(owner.user, owner.password, owner.database);
    const restored = fingerprint(owner.user, owner.password, RESTORE_CHECK_DB);
    const diff = [...new Set([...Object.keys(source), ...Object.keys(restored)])].filter((t) => source[t] !== restored[t]);
    console.log(`local-db: restored ${file} into ${RESTORE_CHECK_DB}: ${Object.keys(restored).length} tables, ${Object.values(restored).reduce((a, b) => a + b, 0)} rows`);
    if (diff.length > 0) {
      fail(`restore check FAILED: tables differ from ${owner.database}: ${diff.join(', ')} (rows written since the backup also show here)`);
    }
    console.log(`local-db: restore check passed: every table and row count matches ${owner.database}`);
  } finally {
    psql('postgres', superPw, 'postgres', `DROP DATABASE IF EXISTS ${RESTORE_CHECK_DB};`);
    console.log(`local-db: temporary database ${RESTORE_CHECK_DB} dropped`);
  }
}

const commands = { init, start, stop, status, migrate, secrets, backup, 'restore-check': restoreCheck };
const command = commands[process.argv[2] ?? ''];
if (!command) {
  fail(`usage: node scripts/local-db.mjs <${Object.keys(commands).join('|')}>`);
}
command();
