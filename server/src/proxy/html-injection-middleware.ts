/**
 * HTML Injection Middleware
 * P08-T002: Intercepts HTML responses and injects console interceptor
 *
 * This middleware wraps the proxy response to:
 * 1. Detect HTML content-type
 * 2. Buffer the response body (with size limit for DoS protection)
 * 3. Inject console interceptor script
 * 4. Handle CSP headers
 *
 * PERFORMANCE FIX (CRITICAL-002): Added size limits to prevent memory exhaustion
 * - Max buffer size: 5MB (configurable)
 * - Responses larger than limit are passed through without injection
 *
 * KNOWN LIMITATIONS:
 * - Cannot handle gzip/brotli responses (would need decompression)
 * - Cannot inject if script-src 'none' CSP is in place
 * - Large HTML files (>5MB) skip injection
 * - Cannot capture errors that happen before script loads
 *
 * SECURITY: Only injects into HTML, preserves all other content types
 *
 * See: docs/CONSOLE_STREAMING_LIMITATIONS.md for detailed analysis
 * Troubleshooting: docs/TROUBLESHOOTING.md#console-streaming-issues
 */

import { IncomingMessage, ServerResponse } from 'http';
import {
  injectConsoleScript,
  isHtmlContent,
  needsInjection,
  generateNonce,
  modifyCSPHeader,
} from '../console/script-injector';
import { logger } from '../utils/logger';

/**
 * PERFORMANCE FIX (CRITICAL-002): Size limit for buffering
 * Responses larger than this will be passed through without injection
 */
const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Type definitions for response method overrides
 */
type WriteFunction = ServerResponse['write'];
type EndFunction = ServerResponse['end'];

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

    logger.debug('Intercepting HTML response for console injection', { url: req.url });

    // Generate nonce for CSP
    const nonce = generateNonce();

    // Buffer to collect response chunks
    // PERFORMANCE FIX (CRITICAL-002): Track total size to prevent memory exhaustion
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let sizeLimitExceeded = false;

    // Override response methods to capture data
    const originalWrite: WriteFunction = res.write.bind(res);
    const originalEnd: EndFunction = res.end.bind(res);
    let isModified = false;

    res.write = function(
      chunk: string | Buffer,
      encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
      callback?: (error: Error | null | undefined) => void
    ): boolean {
      if (sizeLimitExceeded || isModified) {
        // Pass through if size limit exceeded or already modified
        if (typeof encodingOrCallback === 'function') {
          return (originalWrite as typeof originalWrite)(chunk, encodingOrCallback);
        }
        return (originalWrite as typeof originalWrite)(chunk, encodingOrCallback, callback);
      }

      // Track buffer size
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += bufferChunk.length;

      // PERFORMANCE FIX: Check size limit
      if (totalSize > MAX_BUFFER_SIZE) {
        sizeLimitExceeded = true;
        isModified = true; // Skip injection

        logger.warn('HTML response too large for injection, passing through', {
          url: req.url,
          size: totalSize,
          limit: MAX_BUFFER_SIZE,
        });

        // Flush all buffered chunks + this chunk
        for (const bufferedChunk of chunks) {
          originalWrite.call(res, bufferedChunk);
        }
        chunks.length = 0; // Clear buffer

        // Write current chunk
        if (typeof encodingOrCallback === 'function') {
          return (originalWrite as typeof originalWrite)(chunk, encodingOrCallback);
        }
        return (originalWrite as typeof originalWrite)(chunk, encodingOrCallback, callback);
      }

      chunks.push(bufferChunk);
      return true;
    };

    res.end = function(
      chunkOrCallback?: string | Buffer | (() => void),
      encodingOrCallback?: BufferEncoding | (() => void),
      callback?: () => void
    ): ServerResponse {
      // Handle different overload signatures
      let chunk: string | Buffer | undefined;
      let encoding: BufferEncoding | undefined;
      let cb: (() => void) | undefined;

      if (typeof chunkOrCallback === 'function') {
        cb = chunkOrCallback;
      } else {
        chunk = chunkOrCallback;
        if (typeof encodingOrCallback === 'function') {
          cb = encodingOrCallback;
        } else {
          encoding = encodingOrCallback;
          cb = callback;
        }
      }

      // PERFORMANCE FIX: Handle size limit exceeded case
      if (sizeLimitExceeded) {
        // Pass through directly
        if (encoding) {
          return (originalEnd as typeof originalEnd).call(res, chunk, encoding, cb);
        }
        return (originalEnd as typeof originalEnd).call(res, chunk, cb);
      }

      if (chunk) {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalSize += bufferChunk.length;

        // Check size limit on final chunk
        if (totalSize > MAX_BUFFER_SIZE) {
          sizeLimitExceeded = true;
          isModified = true;

          logger.warn('HTML response too large for injection (end), passing through', {
            url: req.url,
            size: totalSize,
            limit: MAX_BUFFER_SIZE,
          });

          // Flush all buffered chunks + final chunk
          for (const bufferedChunk of chunks) {
            originalWrite.call(res, bufferedChunk);
          }

          if (encoding) {
            return (originalEnd as typeof originalEnd).call(res, chunk, encoding, cb);
          }
          return (originalEnd as typeof originalEnd).call(res, chunk, cb);
        }

        chunks.push(bufferChunk);
      }

      if (isModified) {
        if (encoding) {
          return (originalEnd as typeof originalEnd).call(res, chunk, encoding, cb);
        }
        return (originalEnd as typeof originalEnd).call(res, chunk, cb);
      }

      // Combine all chunks into HTML string
      const html = Buffer.concat(chunks).toString('utf-8');

      // Check if injection is needed
      if (!needsInjection(html)) {
        logger.debug('Console script already present, skipping injection', { url: req.url });
        isModified = true;
        return (originalEnd as typeof originalEnd).call(res, html, encoding, cb);
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

      logger.debug('Injected console interceptor script', { url: req.url });

      isModified = true;
      return (originalEnd as typeof originalEnd).call(res, modifiedBuffer, encoding, cb);
    };
  };
}
