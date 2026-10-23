export interface ApiConfig {
  readonly host: string;
  readonly port: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4000;

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORT;
  }
  if (!/^\d+$/.test(raw.trim())) {
    throw new ConfigError(`API_PORT must be an integer, got "${raw}"`);
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new ConfigError(`API_PORT must be between 1 and 65535, got ${port}`);
  }
  return port;
}

/** Reads and validates configuration; throws ConfigError so startup fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const host = env.API_HOST?.trim() || DEFAULT_HOST;
  return { host, port: parsePort(env.API_PORT) };
}
