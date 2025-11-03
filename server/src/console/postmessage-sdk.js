/**
 * Console PostMessage SDK (Fallback)
 * P08-T008: Alternative to WebSocket for console streaming
 *
 * This script provides a fallback mechanism for console streaming
 * when WebSocket is not available. Uses window.postMessage to
 * communicate with parent frame.
 *
 * NOTE: This is injected ONLY if WebSocket connection fails.
 * Primary method is WebSocket (interceptor.js).
 */

(function() {
  'use strict';

  // Store original console methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };

  // Check if running in iframe
  const isIframe = window !== window.parent;

  if (!isIframe) {
    console.warn('[Console PostMessage SDK] Not running in iframe, skipping initialization');
    return;
  }

  /**
   * Serialize console arguments (same as interceptor.js)
   */
  function serializeArgs(args) {
    return Array.from(args).map(arg => {
      try {
        if (arg instanceof Error) {
          return {
            __type: 'error',
            message: arg.message,
            stack: arg.stack,
            name: arg.name,
          };
        }

        if (arg instanceof HTMLElement) {
          return {
            __type: 'element',
            tagName: arg.tagName,
            id: arg.id,
            className: arg.className,
          };
        }

        if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean' || arg === null) {
          return arg;
        }

        if (typeof arg === 'object') {
          try {
            JSON.stringify(arg);
            return arg;
          } catch (e) {
            return {
              __type: 'circular',
              preview: String(arg),
            };
          }
        }

        if (typeof arg === 'function') {
          return {
            __type: 'function',
            name: arg.name || 'anonymous',
          };
        }

        return String(arg);
      } catch (e) {
        return '[Serialization Error]';
      }
    });
  }

  /**
   * Send console message to parent via postMessage
   */
  function sendConsoleMessage(level, args) {
    const message = {
      type: `console:${level}`,
      level: level,
      args: serializeArgs(args),
      timestamp: new Date().toISOString(),
      url: window.location.href,
      source: 'claude-studio-console',
    };

    try {
      // Send to parent window
      // SECURITY: targetOrigin should be specific, but we use '*' for development
      // In production, this should be the actual parent origin
      window.parent.postMessage(message, '*');
    } catch (error) {
      // Fail silently - console streaming is non-critical
      originalConsole.error('[Console PostMessage SDK] Failed to send message:', error);
    }
  }

  /**
   * Override console methods
   */
  function interceptConsole() {
    ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
      console[level] = function(...args) {
        // Call original console method
        originalConsole[level].apply(console, args);

        // Send to parent
        sendConsoleMessage(level, args);
      };
    });
  }

  // Initialize
  interceptConsole();
  console.log('[Console PostMessage SDK] Initialized (iframe mode)');

  // Expose utility to restore original console
  window.__claudeStudio = window.__claudeStudio || {};
  window.__claudeStudio.restoreConsole = function() {
    Object.assign(console, originalConsole);
  };
  window.__claudeStudio.originalConsole = originalConsole;
})();
