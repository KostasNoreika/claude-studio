import { Request, Response, NextFunction } from 'express';
import { ContainerError } from '../docker/errors';
import { logger } from '../utils/logger';

/**
 * 404 Not Found handler
 * Catches all unmatched routes
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    path: req.path,
  });
}

/**
 * Global error handler
 * Catches all errors and returns appropriate response
 * P09-T003: Enhanced with user-friendly error messages
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Request error', { error: err });

  // Handle ContainerError with user-friendly messages
  if (err instanceof ContainerError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.toUserMessage(),
      retryable: err.retryable,
    });
    return;
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: 'Validation Error',
      message: err.message,
    });
    return;
  }

  // Handle rate limit errors
  if (err.message?.includes('Too many requests')) {
    res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many requests. Please try again later.',
    });
    return;
  }

  // Generic error response
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    error: 'Internal Server Error',
    message: isDevelopment
      ? err.message
      : 'An unexpected error occurred. Please try again.',
    ...(isDevelopment && { stack: err.stack }),
  });
}
