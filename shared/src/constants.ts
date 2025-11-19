/**
 * Shared Constants for Claude Studio
 *
 * Centralized constants used across client, server, and shared packages.
 * Extracting magic numbers improves maintainability and consistency.
 *
 * @packageDocumentation
 */

/**
 * WebSocket and Network Constants
 */
export const WEBSOCKET_CONSTANTS = {
  /** WebSocket heartbeat interval in milliseconds (30 seconds) */
  HEARTBEAT_INTERVAL_MS: 30_000,

  /** Base delay for reconnection attempts in milliseconds (1 second) */
  RECONNECT_BASE_DELAY_MS: 1_000,

  /** Maximum reconnection attempts before giving up */
  MAX_RECONNECT_ATTEMPTS: 5,
} as const;

/**
 * Docker and Container Constants
 */
export const CONTAINER_CONSTANTS = {
  /** Health check interval for container monitoring in milliseconds (30 seconds) */
  HEALTH_CHECK_INTERVAL_MS: 30_000,

  /** Circuit breaker reset timeout in milliseconds (30 seconds) */
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 30_000,

  /** Container stop grace period in seconds */
  CONTAINER_STOP_GRACE_PERIOD_SEC: 10,

  /** Default retry initial delay in milliseconds */
  RETRY_INITIAL_DELAY_MS: 500,

  /** Default maximum retry attempts */
  RETRY_MAX_ATTEMPTS: 2,
} as const;

/**
 * Rate Limiting Constants
 */
export const RATE_LIMIT_CONSTANTS = {
  /** Rate limit window in milliseconds (1 second) */
  WINDOW_MS: 1_000,

  /** Maximum messages per window per connection */
  MAX_MESSAGES: 100,

  /** Burst size for token bucket algorithm */
  BURST_SIZE: 20,

  /** Rate limiter cleanup interval in milliseconds (5 minutes) */
  CLEANUP_INTERVAL_MS: 5 * 60 * 1_000,
} as const;

/**
 * Console and Browser Constants
 */
export const CONSOLE_CONSTANTS = {
  /** Maximum queue age for console messages in milliseconds (30 seconds) */
  MAX_QUEUE_AGE_MS: 30_000,
} as const;

/**
 * Session Management Constants
 */
export const SESSION_CONSTANTS = {
  /** Session timeout in milliseconds (30 minutes) */
  SESSION_TIMEOUT_MS: 30 * 60 * 1_000,

  /** File watcher debounce delay in milliseconds */
  FILE_WATCHER_DEBOUNCE_MS: 500,
} as const;

/**
 * Port Configuration Constants
 */
export const PORT_CONSTANTS = {
  /** Minimum allowed port number */
  MIN_PORT: 3_000,

  /** Maximum allowed port number */
  MAX_PORT: 9_999,

  /** Blacklisted ports (SSH, databases, etc.) */
  BLACKLISTED_PORTS: [
    22, // SSH
    23, // Telnet
    25, // SMTP
    53, // DNS
    80, // HTTP (reserved for proxy)
    443, // HTTPS (reserved for proxy)
    3306, // MySQL
    5432, // PostgreSQL
    6379, // Redis
    27017, // MongoDB
  ],
} as const;

/**
 * Test Timeout Constants
 */
export const TEST_CONSTANTS = {
  /** Default test timeout for integration tests in milliseconds (30 seconds) */
  INTEGRATION_TEST_TIMEOUT_MS: 30_000,

  /** Default test timeout for unit tests in milliseconds (5 seconds) */
  UNIT_TEST_TIMEOUT_MS: 5_000,

  /** Wait timeout for async expectations in milliseconds (1 second) */
  ASYNC_WAIT_TIMEOUT_MS: 1_000,
} as const;

/**
 * WebSocket Close Codes
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
 */
export const WS_CLOSE_CODES = {
  /** Normal closure */
  NORMAL: 1_000,

  /** Policy violation (used for authentication failures) */
  POLICY_VIOLATION: 1_008,

  /** Custom code for 401 Unauthorized */
  UNAUTHORIZED: 4_401,
} as const;
