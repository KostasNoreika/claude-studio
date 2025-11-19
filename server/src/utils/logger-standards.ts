/**
 * Logger Standards and Best Practices for Claude Studio
 *
 * This module defines logging standards, required fields, and utilities
 * for consistent, production-grade logging across the codebase.
 *
 * @packageDocumentation
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Standard log context fields
 * All log entries should include these fields where applicable
 */
export interface LogContext {
  /** Unique operation/request identifier for tracing across services */
  operationId?: string;

  /** Session identifier for user/container session tracking */
  sessionId?: string;

  /** Container identifier for Docker operations */
  containerId?: string;

  /** Project name for workspace context */
  projectName?: string;

  /** Timestamp (automatically added by Winston) */
  timestamp?: Date | string;

  /** Additional context-specific fields */
  [key: string]: unknown;
}

/**
 * Required fields for specific operation types
 */
export const REQUIRED_FIELDS = {
  /** Container operations require these fields */
  CONTAINER_OPERATION: ['operation', 'sessionId', 'containerId'] as const,

  /** WebSocket operations require these fields */
  WEBSOCKET_OPERATION: ['operation', 'sessionId'] as const,

  /** Security events require these fields */
  SECURITY_EVENT: ['operation', 'severity', 'sessionId'] as const,

  /** Performance metrics require these fields */
  PERFORMANCE_METRIC: ['operation', 'duration', 'sessionId'] as const,
} as const;

/**
 * Standard operation names for consistency
 */
export const OPERATIONS = {
  // Container operations
  CONTAINER_CREATE: 'container:create',
  CONTAINER_START: 'container:start',
  CONTAINER_STOP: 'container:stop',
  CONTAINER_ATTACH: 'container:attach',
  CONTAINER_HEALTH_CHECK: 'container:health_check',

  // Session operations
  SESSION_CREATE: 'session:create',
  SESSION_RECONNECT: 'session:reconnect',
  SESSION_CLEANUP: 'session:cleanup',

  // WebSocket operations
  WS_CONNECT: 'websocket:connect',
  WS_DISCONNECT: 'websocket:disconnect',
  WS_MESSAGE: 'websocket:message',
  WS_ERROR: 'websocket:error',

  // Security operations
  AUTH_SUCCESS: 'auth:success',
  AUTH_FAILURE: 'auth:failure',
  RATE_LIMIT_EXCEEDED: 'rate_limit:exceeded',
  VALIDATION_FAILED: 'validation:failed',

  // File operations
  FILE_WATCH_START: 'file_watch:start',
  FILE_WATCH_STOP: 'file_watch:stop',
  FILE_CHANGE_DETECTED: 'file_change:detected',
} as const;

/**
 * Correlation ID store for request tracing
 * Maps sessionId to operationId for distributed tracing
 */
class CorrelationIdStore {
  private correlationMap = new Map<string, string>();

  /**
   * Generate a new correlation ID
   * @returns Unique correlation ID
   */
  generate(): string {
    return uuidv4();
  }

  /**
   * Set correlation ID for a session
   * @param sessionId - Session identifier
   * @param correlationId - Correlation identifier
   */
  set(sessionId: string, correlationId: string): void {
    this.correlationMap.set(sessionId, correlationId);
  }

  /**
   * Get correlation ID for a session
   * @param sessionId - Session identifier
   * @returns Correlation ID if exists, undefined otherwise
   */
  get(sessionId: string): string | undefined {
    return this.correlationMap.get(sessionId);
  }

  /**
   * Remove correlation ID for a session
   * @param sessionId - Session identifier
   */
  delete(sessionId: string): void {
    this.correlationMap.delete(sessionId);
  }

  /**
   * Clear all correlation IDs (for testing)
   */
  clear(): void {
    this.correlationMap.clear();
  }
}

/**
 * Global correlation ID store instance
 */
export const correlationIds = new CorrelationIdStore();

/**
 * Create standardized log context with correlation ID
 *
 * @param operation - Operation name (use OPERATIONS constants)
 * @param sessionId - Session identifier
 * @param additionalContext - Additional context fields
 * @returns Standardized log context
 *
 * @example
 * ```typescript
 * const context = createLogContext(
 *   OPERATIONS.CONTAINER_CREATE,
 *   sessionId,
 *   { containerId, projectName }
 * );
 * logger.info('Container created successfully', context);
 * ```
 */
export function createLogContext(
  operation: string,
  sessionId?: string,
  additionalContext?: Record<string, unknown>
): LogContext {
  const context: LogContext = {
    operation,
    ...additionalContext,
  };

  // Add sessionId if provided
  if (sessionId) {
    context.sessionId = sessionId;

    // Get or create correlation ID for this session
    let operationId = correlationIds.get(sessionId);
    if (!operationId) {
      operationId = correlationIds.generate();
      correlationIds.set(sessionId, operationId);
    }
    context.operationId = operationId;
  }

  return context;
}

/**
 * Validate that required fields are present in log context
 *
 * @param context - Log context to validate
 * @param requiredFields - Array of required field names
 * @throws Error if required fields are missing
 *
 * @example
 * ```typescript
 * validateLogContext(context, REQUIRED_FIELDS.CONTAINER_OPERATION);
 * ```
 */
export function validateLogContext(context: LogContext, requiredFields: readonly string[]): void {
  const missingFields = requiredFields.filter((field) => !(field in context));

  if (missingFields.length > 0) {
    throw new Error(`Missing required log context fields: ${missingFields.join(', ')}`);
  }
}

/**
 * Format duration for logging
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted duration object
 *
 * @example
 * ```typescript
 * const start = Date.now();
 * // ... operation ...
 * const duration = formatDuration(Date.now() - start);
 * logger.info('Operation completed', { operation, ...duration });
 * // Logs: { operation: '...', durationMs: 1234, durationSeconds: 1.234 }
 * ```
 */
export function formatDuration(durationMs: number): {
  durationMs: number;
  durationSeconds: number;
} {
  return {
    durationMs,
    durationSeconds: Number((durationMs / 1000).toFixed(3)),
  };
}

/**
 * Sanitize sensitive data for logging
 * Removes or masks sensitive information
 *
 * @param data - Data to sanitize
 * @returns Sanitized data safe for logging
 *
 * @example
 * ```typescript
 * const safeData = sanitizeForLogging({ password: 'secret', username: 'admin' });
 * logger.info('User data', safeData);
 * // Logs: { password: '[REDACTED]', username: 'admin' }
 * ```
 */
export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'authorization',
    'auth',
    'cookie',
    'session',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
