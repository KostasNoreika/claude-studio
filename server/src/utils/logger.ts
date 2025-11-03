/**
 * Centralized Logging System
 *
 * Production-grade structured logging using Winston
 *
 * Features:
 * - JSON format for log aggregation (production)
 * - Console format for development readability
 * - Multiple log levels (error, warn, info, debug)
 * - Timestamp and metadata support
 * - Error stack trace capture
 * - File transports for production logs
 *
 * Usage Examples:
 *
 * Basic logging:
 * ```typescript
 * import { logger } from './utils/logger';
 *
 * logger.info('Server started successfully');
 * logger.error('Database connection failed', { error: err.message });
 * ```
 *
 * With context metadata:
 * ```typescript
 * logger.info('Container created', {
 *   sessionId: 'sess_123',
 *   containerId: 'abc123',
 *   projectName: 'my-project'
 * });
 * ```
 *
 * Error logging with stack traces:
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   logger.error('Operation failed', { error });
 * }
 * ```
 *
 * Child logger with persistent context:
 * ```typescript
 * const sessionLogger = logger.child({ sessionId: 'sess_123' });
 * sessionLogger.info('Action performed'); // Automatically includes sessionId
 * ```
 */

import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Environment configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Ensure logs directory exists
const LOGS_DIR = join(__dirname, '../../logs');
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Custom format for development console output
 * Human-readable format with colors
 */
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    const metadataKeys = Object.keys(metadata);
    if (metadataKeys.length > 0) {
      // Filter out internal winston fields
      const cleanMetadata = Object.fromEntries(
        Object.entries(metadata).filter(([key]) =>
          !['timestamp', 'level', 'message', 'splat'].includes(key)
        )
      );

      if (Object.keys(cleanMetadata).length > 0) {
        msg += `\n  ${JSON.stringify(cleanMetadata, null, 2)}`;
      }
    }

    return msg;
  })
);

/**
 * Production format: JSON with timestamp
 * Optimized for log aggregation systems (ELK, Splunk, etc.)
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Create Winston logger instance
 */
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'claude-studio-server',
    environment: NODE_ENV,
  },
  transports: [
    // Console transport (always enabled)
    new winston.transports.Console({
      format: NODE_ENV === 'production'
        ? productionFormat
        : developmentFormat,
    }),
  ],
});

/**
 * Add file transports in production
 */
if (NODE_ENV === 'production') {
  // Error log: only errors
  logger.add(
    new winston.transports.File({
      filename: join(LOGS_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );

  // Combined log: all levels
  logger.add(
    new winston.transports.File({
      filename: join(LOGS_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

/**
 * Stream interface for Morgan HTTP logging
 * Redirects Morgan output to Winston
 */
export const morganStream = {
  write: (message: string) => {
    // Remove trailing newline from Morgan
    logger.info(message.trim());
  },
};

/**
 * Log initialization message
 */
logger.info('Logger initialized', {
  level: LOG_LEVEL,
  environment: NODE_ENV,
  logsDirectory: LOGS_DIR,
  productionFileLogging: NODE_ENV === 'production',
});
