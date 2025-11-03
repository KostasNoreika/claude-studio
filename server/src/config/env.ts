import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file from server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Application configuration interface
 */
export interface Config {
  port: number;
  nodeEnv: string;
  logLevel: string;
}

/**
 * Validate and parse environment variables
 * @throws {Error} If required variables are invalid
 * @returns {Config} Validated configuration object
 */
function validateConfig(): Config {
  // Parse PORT with validation
  const portStr = process.env.PORT || '3850';
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT environment variable: "${portStr}". Must be a number between 1 and 65535.`
    );
  }

  // Validate NODE_ENV
  const nodeEnv = process.env.NODE_ENV || 'development';
  const validEnvs = ['development', 'production', 'test'];

  if (!validEnvs.includes(nodeEnv)) {
    console.warn(
      `⚠️  Warning: NODE_ENV "${nodeEnv}" is not standard (expected: ${validEnvs.join(', ')}). Using anyway.`
    );
  }

  // Validate LOG_LEVEL
  const logLevel = process.env.LOG_LEVEL || 'info';
  const validLevels = ['error', 'warn', 'info', 'debug'];

  if (!validLevels.includes(logLevel)) {
    console.warn(
      `⚠️  Warning: LOG_LEVEL "${logLevel}" is not valid (expected: ${validLevels.join(', ')}). Defaulting to "info".`
    );
    return {
      port,
      nodeEnv,
      logLevel: 'info',
    };
  }

  return {
    port,
    nodeEnv,
    logLevel,
  };
}

/**
 * Validated application configuration
 * Loaded once at startup
 */
export const config = validateConfig();

/**
 * Export individual configuration values for convenience
 */
export const { port, nodeEnv, logLevel } = config;
