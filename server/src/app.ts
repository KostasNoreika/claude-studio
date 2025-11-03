import express, { Application } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import healthRouter from './routes/health';
import proxyRouter from './api/routes/proxy';
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

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Rate limiting (general)
  app.use(generalRateLimiter);

  // Routes
  app.use('/api/health', healthRouter);
  app.use('/api/proxy', proxyRouter);

  // Dynamic proxy middleware for /preview/:sessionId/*
  // P06-T004: Must be AFTER body parsing but BEFORE error handlers
  app.use('/preview', createDynamicProxyMiddleware());

  // Error handling
  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // 500 handler (must be last)
  app.use(errorHandler);

  return app;
}

// Default export for backwards compatibility
export default createApp();
