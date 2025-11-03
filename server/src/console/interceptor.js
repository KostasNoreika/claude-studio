/**
 * Console Interceptor Script
 * P08-T001: Browser console interception
 *
 * This script is injected into HTML responses to intercept console methods
 * and forward messages to the parent terminal via WebSocket.
 *
 * Security: This script runs in the browser context of proxied pages.
 * It must NOT execute arbitrary code or expose sensitive data.
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

  // WebSocket connection to Claude Studio server
  let ws = null;
  const WS_URL = 'ws://127.0.0.1:3850/ws';

  // Queue for messages before WebSocket is ready
  const messageQueue = [];
  let isConnected = false;

  /**
   * Serialize console arguments to JSON-safe format
   * Handles objects, arrays, errors, and circular references
   */
  function serializeArgs(args) {
    return Array.from(args).map(arg => {
      try {
        // Handle Error objects
        if (arg instanceof Error) {
          return {
            __type: 'error',
            message: arg.message,
            stack: arg.stack,
            name: arg.name,
          };
        }

        // Handle DOM elements
        if (arg instanceof HTMLElement) {
          return {
            __type: 'element',
            tagName: arg.tagName,
            id: arg.id,
            className: arg.className,
          };
        }

        // Handle primitive types and JSON-serializable objects
        if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean' || arg === null) {
          return arg;
        }

        // Handle objects/arrays (with circular reference protection)
        if (typeof arg === 'object') {
          try {
            // Use JSON.stringify to detect circular references
            JSON.stringify(arg);
            return arg;
          } catch (e) {
            return {
              __type: 'circular',
              preview: String(arg),
            };
          }
        }

        // Handle functions
        if (typeof arg === 'function') {
          return {
            __type: 'function',
            name: arg.name || 'anonymous',
          };
        }

        // Fallback: convert to string
        return String(arg);
      } catch (e) {
        return '[Serialization Error]';
      }
    });
  }

  /**
   * Send console message to server via WebSocket
   */
  function sendConsoleMessage(level, args) {
    const message = {
      type: `console:${level}`,
      level: level,
      args: serializeArgs(args),
      timestamp: new Date().toISOString(),
      url: window.location.href,
    };

    if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      // Queue message for later
      messageQueue.push(message);
    }
  }

  /**
   * Initialize WebSocket connection
   */
  function initWebSocket() {
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = function() {
        isConnected = true;
        console.log('[Console Interceptor] Connected to Claude Studio');

        // Send queued messages
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          ws.send(JSON.stringify(msg));
        }
      };

      ws.onerror = function(error) {
        console.error('[Console Interceptor] WebSocket error:', error);
      };

      ws.onclose = function() {
        isConnected = false;
        // Attempt reconnection after 2 seconds
        setTimeout(initWebSocket, 2000);
      };
    } catch (error) {
      console.error('[Console Interceptor] Failed to initialize WebSocket:', error);
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

        // Send to server
        sendConsoleMessage(level, args);
      };
    });
  }

  // Initialize
  interceptConsole();
  initWebSocket();

  // Expose utility to restore original console (for debugging)
  window.__claudeStudio = {
    restoreConsole: function() {
      Object.assign(console, originalConsole);
    },
    originalConsole: originalConsole,
  };
})();
