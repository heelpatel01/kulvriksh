// Process-level tests: run the real entry point (src/server.ts) with Node type stripping.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';

const API_DIR = join(import.meta.dirname, '..');
const TIMEOUT_MS = 15_000;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function startApi(env: Record<string, string>): { child: ChildProcess; output: () => RunResult; exited: Promise<RunResult> } {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'info', ...env };
  delete childEnv.API_HOST;
  const child = spawn(process.execPath, ['src/server.ts'], { cwd: API_DIR, env: childEnv, stdio: 'pipe' });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const output = () => ({ code: child.exitCode, stdout, stderr });
  const exited = new Promise<RunResult>((resolve) => child.on('exit', (code) => resolve({ code, stdout, stderr })));
  return { child, output, exited };
}

function jsonLines(text: string): Record<string, unknown>[] {
  return text
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test('invalid configuration stops startup with exit code 1 and a structured error listing every issue', { timeout: TIMEOUT_MS }, async () => {
  const { exited } = startApi({ API_PORT: 'abc', LOG_LEVEL: 'loud' });
  const result = await exited;
  assert.equal(result.code, 1);
  const [entry] = jsonLines(result.stderr);
  assert.equal(entry?.level, 'error');
  assert.equal(entry?.msg, 'configuration error');
  assert.equal((entry?.issues as string[]).length, 2);
  assert.doesNotMatch(result.stdout, /listening/);
});

test('an invalid DATABASE_URL stops startup without printing the connection string', { timeout: TIMEOUT_MS }, async () => {
  const result = await startApi({ DATABASE_URL: 'postgresql://u:sample-pw-not-real@db.example.com:5432/kulvriksh' }).exited;
  assert.equal(result.code, 1);
  const [entry] = jsonLines(result.stderr);
  assert.equal(entry?.msg, 'configuration error');
  assert.match(String((entry?.issues as string[])[0]), /loopback host/);
  assert.doesNotMatch(result.stdout + result.stderr, /sample-pw-not-real|db\.example\.com/);
});

test('starts, logs a structured "listening" line and serves /health', { timeout: TIMEOUT_MS }, async () => {
  const port = await freePort();
  const { child, output, exited } = startApi({ API_PORT: String(port) });
  try {
    await waitFor(() => /"msg":"listening"/.test(output().stdout), 'the listening log line');
    const listening = jsonLines(output().stdout).find((l) => l.msg === 'listening');
    assert.equal(listening?.service, 'kulvriksh-api');
    assert.equal(listening?.url, `http://127.0.0.1:${port}`);
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
  } finally {
    child.kill();
    await exited;
  }
});

test('regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening"', { timeout: TIMEOUT_MS }, async () => {
  const blocker = createNetServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const { port } = blocker.address() as AddressInfo;
  try {
    const result = await startApi({ API_PORT: String(port) }).exited;
    assert.equal(result.code, 1);
    assert.doesNotMatch(result.stdout, /listening/);
    const entry = jsonLines(result.stderr).find((l) => l.msg === 'server error');
    const err = entry?.err as Record<string, unknown>;
    assert.match(String(err?.message), /EADDRINUSE/);
    // Safe error form keeps useful system-error fields.
    assert.equal(err?.code, 'EADDRINUSE');
    assert.equal(err?.syscall, 'listen');
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});
