/**
 * Dynamic Proxy Middleware
 * P06-T004: Proxy /preview/:sessionId to configured port
 * P06-T008: WebSocket upgrade support for HMR
 *
 * Uses http-proxy-middleware to dynamically proxy requests
 * based on per-session port configuration
 */

import { Request, Response } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { IncomingMessage, ServerResponse } from 'http';
import { portConfigManager } from './PortConfigManager';
import { validateProxyTargetWithPort } from '../security/ssrf-validator';
import { createHtmlInjectionMiddleware } from './html-injection-middleware';

/**
 * Create dynamic proxy middleware that routes based on sessionId
 * P08-T002: Enhanced with HTML injection for console streaming
 */
export function createDynamicProxyMiddleware() {
  const options: Options = {
    // Dynamic target based on sessionId
    router: async (req) => {
      // Extract sessionId from path: /preview/:sessionId/*
      const url = req.url || '';
      const match = url.match(/^\/preview\/([^/]+)/);
      if (!match) {
        console.warn('[Proxy] Invalid preview URL (no sessionId)');
        return 'http://127.0.0.1:3000'; // Fallback (will 404)
      }

      const sessionId = match[1];
      const port = portConfigManager.getPortForSession(sessionId);

      if (port === null) {
        console.warn(`[Proxy] No port configured for session ${sessionId}`);
        return 'http://127.0.0.1:3000'; // Fallback (will 404)
      }

      // SSRF validation (double-check)
      const validation = validateProxyTargetWithPort('127.0.0.1', port);
      if (!validation.allowed) {
        console.error(`[Proxy] SSRF validation failed: ${validation.reason}`);
        return 'http://127.0.0.1:3000'; // Fallback (will 404)
      }

      const target = `http://127.0.0.1:${port}`;
      console.log(`[Proxy] Routing ${sessionId} → ${target}`);
      return target;
    },

    // Path rewrite: Remove /preview/:sessionId prefix
    pathRewrite: (path, req) => {
      const match = path.match(/^\/preview\/[^/]+(\/.*)?$/);
      if (match) {
        const rewritten = match[1] || '/';
        console.log(`[Proxy] Path rewrite: ${path} → ${rewritten}`);
        return rewritten;
      }
      return path;
    },

    // WebSocket support for HMR (P06-T008)
    ws: true,

    // Change origin to prevent CORS issues
    changeOrigin: true,

    // P08-T002: Inject console interceptor into HTML responses
    on: {
      proxyRes: createHtmlInjectionMiddleware(),
    },
  };

  const proxy = createProxyMiddleware(options);

  // Wrap to add custom error handling
  return (req: IncomingMessage, res: ServerResponse, next?: () => void) => {
    // Set up error handler on the response stream
    res.on('error', (err: Error) => {
      console.error('[Proxy] Response error:', err.message);
    });

    try {
      proxy(req, res, next);
    } catch (err) {
      console.error('[Proxy] Middleware error:', err);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Proxy error',
          message: 'Failed to connect to development server',
        }));
      }
    }
  };
}
