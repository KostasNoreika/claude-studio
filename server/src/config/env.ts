import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Load .env file from server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Application configuration interface
 */
export interface Config {
  port: number;
  nodeEnv: string;
  logLevel: string;
  mcpEnabled: boolean;
  chromeDebugPort: number;
  wsAuthToken: string;

  // Docker configuration
  dockerHost?: string;

  // Docker container credential paths
  claudeAccountDir: string;
  claudeManagerDir: string;
  mcpDir: string;
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
    // Use console.warn here as logger is not yet initialized during config validation
    console.warn(
      `⚠️  Warning: NODE_ENV "${nodeEnv}" is not standard (expected: ${validEnvs.join(', ')}). Using anyway.`
    );
  }

  // Validate LOG_LEVEL
  const logLevel = process.env.LOG_LEVEL || 'info';
  const validLevels = ['error', 'warn', 'info', 'debug'];

  if (!validLevels.includes(logLevel)) {
    // Use console.warn here as logger is not yet initialized during config validation
    console.warn(
      `⚠️  Warning: LOG_LEVEL "${logLevel}" is not valid (expected: ${validLevels.join(', ')}). Defaulting to "info".`
    );

    // Parse DOCKER_HOST (optional, defaults to Unix socket)
    const dockerHost = process.env.DOCKER_HOST;
    if (dockerHost) {
      // Log connection info (mask any passwords in URL)
      const maskedHost = dockerHost.replace(/:[^:@]*@/, ':****@');
      console.log(`🐳 Using Docker daemon: ${maskedHost}`);
    }

    return {
      port,
      nodeEnv,
      logLevel: 'info',
      mcpEnabled: parseMCPEnabled(),
      chromeDebugPort: parseChromeDebugPort(),
      wsAuthToken: validateWsAuthToken(),
      dockerHost,
      claudeAccountDir: validateDirectoryPath('CLAUDE_ACCOUNT_DIR', path.join(os.homedir(), '.claude-acc4')),
      claudeManagerDir: validateDirectoryPath('CLAUDE_MANAGER_DIR', path.join(os.homedir(), '.claude-manager')),
      mcpDir: validateDirectoryPath('MCP_DIR', '/opt/mcp'),
    };
  }

  // Parse DOCKER_HOST (optional, defaults to Unix socket)
  const dockerHost = process.env.DOCKER_HOST;
  if (dockerHost) {
    // Log connection info (mask any passwords in URL)
    const maskedHost = dockerHost.replace(/:[^:@]*@/, ':****@');
    console.log(`🐳 Using Docker daemon: ${maskedHost}`);
  }

  return {
    port,
    nodeEnv,
    logLevel,
    mcpEnabled: parseMCPEnabled(),
    chromeDebugPort: parseChromeDebugPort(),
    wsAuthToken: validateWsAuthToken(),
    dockerHost,
    claudeAccountDir: validateDirectoryPath('CLAUDE_ACCOUNT_DIR', path.join(os.homedir(), '.claude-acc4')),
    claudeManagerDir: validateDirectoryPath('CLAUDE_MANAGER_DIR', path.join(os.homedir(), '.claude-manager')),
    mcpDir: validateDirectoryPath('MCP_DIR', '/opt/mcp'),
  };
}

/**
 * Parse MCP_ENABLED environment variable
 * Accepts: true, 1, 'true', 'yes' (case-insensitive)
 * Default: false
 */
function parseMCPEnabled(): boolean {
  const envValue = process.env.MCP_ENABLED || 'false';
  return ['true', '1', 'yes'].includes(envValue.toLowerCase());
}

/**
 * Parse CHROME_DEBUG_PORT environment variable
 * Default: 9223
 */
function parseChromeDebugPort(): number {
  const portStr = process.env.CHROME_DEBUG_PORT || '9223';
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    // Use console.warn here as logger is not yet initialized during config validation
    console.warn(
      `⚠️  Warning: Invalid CHROME_DEBUG_PORT "${portStr}". Must be a number between 1 and 65535. Using default 9223.`
    );
    return 9223;
  }

  return port;
}

/**
 * Validate WS_AUTH_TOKEN environment variable
 *
 * Security requirements:
 * - REQUIRED in production (process exits if not set)
 * - Optional in development (defaults to 'dev-token-12345')
 * - Minimum length: 16 characters for production
 * - Recommended: Use cryptographically secure random tokens (e.g., openssl rand -hex 32)
 *
 * @returns Validated authentication token
 * @throws {Error} If token is missing in production or too weak
 */
function validateWsAuthToken(): string {
  const token = process.env.WS_AUTH_TOKEN;
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Production: token is REQUIRED
  if (nodeEnv === 'production') {
    if (!token) {
      throw new Error(
        'CRITICAL SECURITY ERROR: WS_AUTH_TOKEN must be set in production environment.\n' +
        'Generate a secure token using: openssl rand -hex 32\n' +
        'Then set: WS_AUTH_TOKEN=your_generated_token'
      );
    }

    // Validate token strength in production
    if (token.length < 16) {
      throw new Error(
        'CRITICAL SECURITY ERROR: WS_AUTH_TOKEN must be at least 16 characters in production.\n' +
        'Current length: ' + token.length + '\n' +
        'Generate a secure token using: openssl rand -hex 32'
      );
    }

    // Warn about weak tokens
    if (token === 'dev-token-12345' || token.toLowerCase().includes('test') || token.toLowerCase().includes('dev')) {
      throw new Error(
        'CRITICAL SECURITY ERROR: WS_AUTH_TOKEN appears to be a development token.\n' +
        'Do not use default or test tokens in production.\n' +
        'Generate a secure token using: openssl rand -hex 32'
      );
    }

    // Use console.log here as logger is not yet initialized during config validation
    console.log('✅ WebSocket authentication enabled with secure token');
    return token;
  }

  // Development: use default if not set
  if (!token) {
    // Use console.warn here as logger is not yet initialized during config validation
    console.warn(
      '⚠️  Warning: WS_AUTH_TOKEN not set. Using development default: "dev-token-12345"\n' +
      '   This is insecure. Set WS_AUTH_TOKEN in .env for production.'
    );
    return 'dev-token-12345';
  }

  // Development with custom token
  // Use console.log here as logger is not yet initialized during config validation
  console.log('✅ WebSocket authentication enabled with custom token');
  return token;
}

/**
 * Validate directory path for Docker volume mounts
 *
 * Security requirements:
 * 1. Path must be absolute
 * 2. Directory must exist on host system
 * 3. Path must be readable
 *
 * @param envVarName - Name of environment variable (for error messages)
 * @param defaultPath - Default path if env var not set
 * @returns Validated absolute directory path
 * @throws {Error} If path is invalid or directory doesn't exist
 */
function validateDirectoryPath(envVarName: string, defaultPath: string): string {
  const configuredPath = process.env[envVarName];
  const pathToValidate = configuredPath || defaultPath;

  // Validate path is absolute
  if (!path.isAbsolute(pathToValidate)) {
    throw new Error(
      `${envVarName}: Path must be absolute. Got: "${pathToValidate}"`
    );
  }

  // Resolve path to normalize it (remove .., ., etc.)
  const resolvedPath = path.resolve(pathToValidate);

  // Security check: ensure no path traversal after normalization
  if (resolvedPath !== pathToValidate) {
    // Use console.warn here as logger is not yet initialized during config validation
    console.warn(
      `⚠️  Warning: ${envVarName} path was normalized from "${pathToValidate}" to "${resolvedPath}"`
    );
  }

  // Check if directory exists
  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error(
        `${envVarName}: Path exists but is not a directory: "${resolvedPath}"`
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `${envVarName}: Directory does not exist: "${resolvedPath}". ` +
        `Create it first or set ${envVarName} to an existing directory.`
      );
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(
        `${envVarName}: Permission denied reading directory: "${resolvedPath}". ` +
        `Ensure the server process has read access.`
      );
    }
    throw error;
  }

  // Try to read directory to verify permissions
  try {
    fs.readdirSync(resolvedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(
        `${envVarName}: Directory is not readable: "${resolvedPath}". ` +
        `Ensure the server process has read permissions.`
      );
    }
    // Other errors may be ok (e.g., empty directory)
  }

  return resolvedPath;
}

/**
 * Validated application configuration
 * Loaded once at startup
 */
export const config = validateConfig();

/**
 * Export individual configuration values for convenience
 */
export const {
  port,
  nodeEnv,
  logLevel,
  mcpEnabled,
  chromeDebugPort,
  wsAuthToken,
  dockerHost,
  claudeAccountDir,
  claudeManagerDir,
  mcpDir,
} = config;
