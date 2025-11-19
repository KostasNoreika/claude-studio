/**
 * Client-Side Logger Utility for Claude Studio
 *
 * Production-grade logger with dev/prod modes, log level filtering,
 * and structured logging support.
 *
 * Features:
 * - Development mode: Full console output with colors
 * - Production mode: Minimal console output, errors only
 * - Log level filtering
 * - Structured metadata support
 * - Type-safe logging methods
 *
 * @packageDocumentation
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Log metadata for structured logging
 */
export interface LogMetadata {
  [key: string]: unknown;
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  /** Current log level (messages below this level are suppressed) */
  level: LogLevel;

  /** Whether to use production mode (minimal output) */
  productionMode: boolean;

  /** Prefix for all log messages */
  prefix?: string;
}

/**
 * Logger class for client-side logging
 *
 * Provides consistent, filterable logging with dev/prod modes.
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger';
 *
 * // Basic logging
 * logger.info('User connected');
 * logger.error('Connection failed');
 *
 * // With metadata
 * logger.info('WebSocket connected', { sessionId: 'abc123' });
 *
 * // With prefix
 * const wsLogger = logger.child('[WebSocket]');
 * wsLogger.debug('Message received', { type: 'terminal:output' });
 * ```
 */
export class Logger {
  private config: LoggerConfig;

  /**
   * Create a new logger instance
   *
   * @param config - Logger configuration
   */
  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: this.getDefaultLogLevel(),
      productionMode: import.meta.env.PROD,
      ...config,
    };
  }

  /**
   * Get default log level based on environment
   * @private
   */
  private getDefaultLogLevel(): LogLevel {
    if (import.meta.env.PROD) {
      return LogLevel.ERROR; // Production: errors only
    }

    // Check for explicit log level in environment
    const envLevel = import.meta.env.VITE_LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      return LogLevel[envLevel as keyof typeof LogLevel];
    }

    return LogLevel.DEBUG; // Development: debug and above
  }

  /**
   * Create a child logger with a prefix
   *
   * @param prefix - Prefix to prepend to all messages
   * @returns New logger instance with prefix
   *
   * @example
   * ```typescript
   * const wsLogger = logger.child('[WebSocket]');
   * wsLogger.info('Connected'); // Logs: "[WebSocket] Connected"
   * ```
   */
  child(prefix: string): Logger {
    const childPrefix = this.config.prefix ? `${this.config.prefix} ${prefix}` : prefix;

    return new Logger({
      ...this.config,
      prefix: childPrefix,
    });
  }

  /**
   * Set log level
   *
   * @param level - New log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   *
   * @returns Current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Log a debug message
   *
   * @param message - Log message
   * @param metadata - Optional structured metadata
   */
  debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log an info message
   *
   * @param message - Log message
   * @param metadata - Optional structured metadata
   */
  info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log a warning message
   *
   * @param message - Log message
   * @param metadata - Optional structured metadata
   */
  warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log an error message
   *
   * @param message - Log message
   * @param metadata - Optional structured metadata or Error object
   */
  error(message: string, metadata?: LogMetadata | Error): void {
    // Convert Error to metadata
    if (metadata instanceof Error) {
      metadata = {
        error: metadata.message,
        stack: metadata.stack,
        name: metadata.name,
      };
    }

    this.log(LogLevel.ERROR, message, metadata);
  }

  /**
   * Core logging method
   * @private
   */
  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    // Filter by log level
    if (level < this.config.level) {
      return;
    }

    // Format message with prefix
    const formattedMessage = this.config.prefix ? `${this.config.prefix} ${message}` : message;

    // Format metadata
    const formattedMetadata = metadata ? this.formatMetadata(metadata) : '';

    // In production, only log errors
    if (this.config.productionMode && level < LogLevel.ERROR) {
      return;
    }

    // Use appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage, formattedMetadata);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage, formattedMetadata);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, formattedMetadata);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage, formattedMetadata);
        break;
    }
  }

  /**
   * Format metadata for console output
   * @private
   */
  private formatMetadata(metadata: LogMetadata): string {
    if (Object.keys(metadata).length === 0) {
      return '';
    }

    // In production, use compact JSON
    if (this.config.productionMode) {
      return JSON.stringify(metadata);
    }

    // In development, use pretty-printed JSON
    return '\n' + JSON.stringify(metadata, null, 2);
  }
}

/**
 * Default logger instance
 * Use this for general application logging
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger';
 *
 * logger.info('Application started');
 * logger.error('Something went wrong', { error: err });
 * ```
 */
export const logger = new Logger();

/**
 * Export LogLevel for external configuration
 */
export { LogLevel as Level };
