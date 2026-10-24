import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { ConfigError, loadConfig, type ApiConfig } from './config.ts';
import { createLogger } from './logger.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function readConfig(): ApiConfig {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      createLogger({ level: 'error' }).error('configuration error', { issues: err.issues });
      process.exit(1);
    }
    throw err;
  }
}

const config = readConfig();
const logger = createLogger({ level: config.logLevel, bindings: { service: 'kulvriksh-api' } });

// An explicit http.Server is used because Express 5's app.listen() also calls its callback
// on failure (e.g. EADDRINUSE). server.listen() calls it only once listening has succeeded.
const server = createServer(createApp({ logger }));

server.on('error', (err) => {
  logger.error('server error', { err });
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  logger.info('listening', { url: `http://${config.host}:${config.port}`, nodeEnv: config.nodeEnv });
});

let shuttingDown = false;

function shutdown(reason: string, exitCode: number): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('shutting down', { reason });

  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      logger.error('error while closing', { err });
      process.exit(1);
    }
    process.exit(exitCode);
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

// After an unexpected error the process state is unknown: log it, stop accepting work, exit non-zero.
process.on('uncaughtException', (err) => {
  logger.error('uncaught exception', { err });
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', { err: reason });
  shutdown('unhandledRejection', 1);
});
