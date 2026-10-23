import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { ConfigError, loadConfig, type ApiConfig } from './config.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function readConfig(): ApiConfig {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[api] configuration error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

const config = readConfig();

// An explicit http.Server is used because Express 5's app.listen() also calls its callback
// on failure (e.g. EADDRINUSE). server.listen() calls it only once listening has succeeded.
const server = createServer(createApp());

server.on('error', (err) => {
  console.error(`[api] server error: ${err.message}`);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.log(`[api] listening on http://${config.host}:${config.port}`);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[api] ${signal} received, closing server`);

  const forceExit = setTimeout(() => {
    console.error('[api] shutdown timed out, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      console.error(`[api] error while closing: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
