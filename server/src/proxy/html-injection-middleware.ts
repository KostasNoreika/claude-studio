/**
 * HTML Injection Middleware
 * P08-T002: Intercepts HTML responses and injects console interceptor
 *
 * This middleware wraps the proxy response to:
 * 1. Detect HTML content-type
 * 2. Buffer the response body
 * 3. Inject console interceptor script
 * 4. Handle CSP headers
 *
 * SECURITY: Only injects into HTML, preserves all other content types
 */

import { IncomingMessage, ServerResponse } from 'http';
import {
  injectConsoleScript,
  isHtmlContent,
  needsInjection,
  generateNonce,
  modifyCSPHeader,
} from '../console/script-injector';

/**
 * Create a response interceptor for HTML injection
 *
 * Wraps the original response object to capture and modify HTML responses.
 *
 * This is an onProxyRes handler for http-proxy-middleware
 */
export function createHtmlInjectionMiddleware() {
  return (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse): void => {
    const contentType = proxyRes.headers['content-type'];

    // Only process HTML responses
    if (!isHtmlContent(contentType)) {
      return; // Pass through non-HTML content unchanged
    }

    console.log('[HTML Injection] Intercepting HTML response for', req.url);

    // Generate nonce for CSP
    const nonce = generateNonce();

    // Buffer to collect response chunks
    const chunks: Buffer[] = [];

    // Override response methods to capture data
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    let isModified = false;

    res.write = function(chunk: any, ...args: any[]): boolean {
      if (!isModified) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      }
      return originalWrite(chunk, ...args);
    };

    res.end = function(chunk?: any, ...args: any[]): ServerResponse {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      if (isModified) {
        return originalEnd(chunk, ...args);
      }

      // Combine all chunks into HTML string
      const html = Buffer.concat(chunks).toString('utf-8');

      // Check if injection is needed
      if (!needsInjection(html)) {
        console.log('[HTML Injection] Script already present, skipping');
        isModified = true;
        return originalEnd(html, ...args);
      }

      // Inject console script
      const modifiedHtml = injectConsoleScript(html, { useNonce: true, nonce });

      // Update Content-Length header
      const modifiedBuffer = Buffer.from(modifiedHtml, 'utf-8');
      res.setHeader('Content-Length', modifiedBuffer.length);

      // Modify CSP header if present
      const cspHeader = proxyRes.headers['content-security-policy'];
      if (cspHeader) {
        const modifiedCSP = modifyCSPHeader(
          Array.isArray(cspHeader) ? cspHeader.join('; ') : cspHeader,
          { useNonce: true, nonce }
        );
        res.setHeader('Content-Security-Policy', modifiedCSP);
      }

      console.log('[HTML Injection] Injected console interceptor script');

      isModified = true;
      return originalEnd(modifiedBuffer, ...args);
    };
  };
}
