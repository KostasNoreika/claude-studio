/**
 * Rate Limiting Middleware
 * P09-T005: Prevent DoS attacks via rate limiting
 *
 * Implements different rate limits for different endpoints:
 * - Container operations: more restrictive
 * - Preview configuration: moderate
 * - General API: lenient
 */

import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter
 * 100 requests per minute per IP
 */
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health checks
  skip: (req) => req.path === '/api/health',
});

/**
 * Container operations rate limiter
 * 10 container operations per minute per IP
 *
 * Prevents abuse via rapid container creation/deletion
 */
export const containerRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    error: 'Container Rate Limit Exceeded',
    message:
      'Too many container operations. Please wait before creating more containers.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use default keyGenerator for IPv6 compatibility
  // Custom logic for session-based limiting can be added via skip function
  skip: (_req) => {
    // Could implement session-based skip logic here if needed
    return false;
  },
});

/**
 * Preview configuration rate limiter
 * 20 preview configurations per minute per IP
 *
 * Prevents SSRF attack attempts via rapid proxy configuration changes
 */
export const previewRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: {
    error: 'Preview Rate Limit Exceeded',
    message: 'Too many preview configurations. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Authentication rate limiter
 * 5 failed attempts per 15 minutes
 *
 * Prevents brute force attacks on authentication
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    error: 'Authentication Rate Limit Exceeded',
    message:
      'Too many authentication attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for sensitive operations
 * 3 requests per minute per IP
 *
 * For operations that could expose sensitive information or cause harm
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Too many requests for this resource. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * WebSocket connection rate limiter
 * 5 connections per minute per IP
 *
 * Prevents WebSocket flood attacks
 */
export const websocketRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: {
    error: 'WebSocket Rate Limit Exceeded',
    message: 'Too many connection attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
