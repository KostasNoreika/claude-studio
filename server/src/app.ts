import express, { Application } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { join } from 'path';
import { existsSync } from 'fs';
import { healthRouter } from './routes/health';
import { projectsRouter } from './routes/projects';
import { mcpRouter } from './routes/mcp';
import { proxyRouter } from './api/routes/proxy';
import { createDynamicProxyMiddleware } from './proxy/middleware';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalRateLimiter } from './middleware/rate-limit';
import { logLevel } from './config/env';

/**
 * Create Express application with middleware and routes
 * P09-T005: Added rate limiting middleware
 */
export function createApp(): Application {
  const app: Application = express();

  // Middleware
  // Trust proxy for rate limiting (behind Traefik)
  app.set('trust proxy', 1);

  // CORS: Same-origin only for security
  app.use(
    cors({
      origin: 'http://localhost:3850',
      credentials: true,
    })
  );

  // Request logging
  // Use 'dev' format for debug level, 'combined' for production
  const morganFormat = logLevel === 'debug' ? 'dev' : 'combined';
  app.use(morgan(morganFormat));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // SECURITY FIX (HIGH-002): Content Security Policy and security headers
  app.use((_req, res, next) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking (except for preview iframes)
    if (!_req.path.startsWith('/preview/')) {
      res.setHeader('X-Frame-Options', 'DENY');
    }

    // Legacy XSS protection (deprecated but still useful for older browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Strict Transport Security (HTTPS only in production)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Content Security Policy
    // Allows:
    // - Self-hosted scripts and styles
    // - Inline scripts/styles with nonces (for console injection)
    // - WebSocket connections to same origin
    // - Images from self and data URLs
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // unsafe-inline needed for React dev tools and injected scripts
      "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for styled-components
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:", // Allow WebSocket connections
      "frame-src 'self'", // Allow preview iframes from same origin
      "object-src 'none'", // Block plugins
      "base-uri 'self'", // Prevent base tag injection
      "form-action 'self'", // Only submit forms to same origin
      "frame-ancestors 'none'", // Prevent embedding except where allowed by X-Frame-Options
      "upgrade-insecure-requests", // Upgrade HTTP to HTTPS in production
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);

    // Permissions Policy (formerly Feature-Policy)
    // Restrict browser features to prevent abuse
    const permissionsPolicy = [
      'geolocation=()', // Deny geolocation
      'microphone=()', // Deny microphone
      'camera=()', // Deny camera
      'payment=()', // Deny payment APIs
      'usb=()', // Deny USB access
      'magnetometer=()', // Deny magnetometer
      'gyroscope=()', // Deny gyroscope
      'accelerometer=()', // Deny accelerometer
    ].join(', ');

    res.setHeader('Permissions-Policy', permissionsPolicy);

    // Referrer Policy - don't leak URLs to external sites
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    next();
  });

  // Rate limiting (general)
  app.use(generalRateLimiter);

  // Routes
  app.use('/api/health', healthRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/mcp', mcpRouter);
  app.use('/api/proxy', proxyRouter);

  // Dynamic proxy middleware for /preview/:sessionId/*
  // P06-T004: Must be AFTER body parsing but BEFORE error handlers
  app.use('/preview', createDynamicProxyMiddleware());

  // Production: Serve frontend static files
  if (process.env.NODE_ENV === 'production') {
    const clientDistPath = join(__dirname, '../../client/dist');

    if (existsSync(clientDistPath)) {
      // Serve static files
      app.use(express.static(clientDistPath));

      // SPA fallback - serve index.html for all non-API routes
      app.use((req, res, next) => {
        // Skip API routes and preview routes
        if (req.path.startsWith('/api/') || req.path.startsWith('/preview/')) {
          return next();
        }

        // Serve index.html for HTML requests (SPA fallback)
        if (req.accepts('html')) {
          res.sendFile(join(clientDistPath, 'index.html'));
        } else {
          next();
        }
      });
    }
  }

  // Error handling
  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // 500 handler (must be last)
  app.use(errorHandler);

  return app;
}
