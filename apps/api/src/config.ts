export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ApiConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
}

/** Thrown when configuration is invalid. Lists every problem so they can all be fixed at once. */
export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid configuration: ${issues.join('; ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4000;
const DEFAULT_NODE_ENV: NodeEnv = 'development';
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function readEnum<T extends string>(
  name: string,
  raw: string | undefined,
  values: readonly T[],
  fallback: T,
  issues: string[],
): T {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = raw.trim();
  if (isOneOf(values, value)) {
    return value;
  }
  issues.push(`${name} must be one of ${values.join(', ')}, got "${raw}"`);
  return fallback;
}

function readPort(raw: string | undefined, issues: string[]): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORT;
  }
  if (!/^\d+$/.test(raw.trim())) {
    issues.push(`API_PORT must be an integer, got "${raw}"`);
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    issues.push(`API_PORT must be between 1 and 65535, got ${port}`);
    return DEFAULT_PORT;
  }
  return port;
}

/** Reads and validates configuration; throws ConfigError so startup fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const issues: string[] = [];
  const config: ApiConfig = {
    nodeEnv: readEnum('NODE_ENV', env.NODE_ENV, NODE_ENVS, DEFAULT_NODE_ENV, issues),
    host: env.API_HOST?.trim() || DEFAULT_HOST,
    port: readPort(env.API_PORT, issues),
    logLevel: readEnum('LOG_LEVEL', env.LOG_LEVEL, LOG_LEVELS, DEFAULT_LOG_LEVEL, issues),
  };
  if (issues.length > 0) {
    throw new ConfigError(issues);
  }
  return config;
}
