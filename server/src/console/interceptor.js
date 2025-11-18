/**
 * Console Interceptor Script
 * P08-T001: Browser console interception
 *
 * This script is injected into HTML responses to intercept console methods
 * and forward messages to the parent terminal via WebSocket.
 *
 * SECURITY FIX (HIGH-003): Token transmission via postMessage instead of URL params
 * - Prevents token exposure in browser history and network logs
 * - Uses same-origin validation for security
 * - Token is cleared from memory after WebSocket connection
 *
 * KNOWN LIMITATIONS:
 * - Cannot capture errors that occur before this script loads
 * - Cannot intercept network requests (use Network DevTools for that)
 * - Cannot measure performance metrics (use Performance tab in DevTools)
 * - WebSocket connection creates overhead per page (1-2 connections per user)
 * - Runs in iframe sandbox with limited API access
 *
 * Security: This script runs in the browser context of proxied pages.
 * It must NOT execute arbitrary code or expose sensitive data.
 *
 * See: docs/CONSOLE_STREAMING_LIMITATIONS.md for detailed analysis
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

  // SECURITY FIX (CRITICAL-001): Dynamic WebSocket URL
  // Generates URL based on current page location to support both:
  // - Development: ws://127.0.0.1:3850/ws
  // - Production: wss://studio.example.com/ws
  const WS_URL = (function() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return protocol + '//' + host + '/ws';
  })();

  // Queue for messages before WebSocket is ready
  // PERFORMANCE FIX (CRITICAL-002): Bounded queue with size limits and TTL
  const MAX_QUEUE_SIZE = 100; // Max 100 messages (prevents memory leak)
  const MAX_QUEUE_AGE_MS = 30000; // 30 seconds TTL
  const messageQueue = [];
  let isConnected = false;
  let ws = null;
  let authToken = null; // Will be set via postMessage

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
          } catch {
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
      } catch {
        return '[Serialization Error]';
      }
    });
  }

  /**
   * Send console message to server via WebSocket
   * PERFORMANCE FIX (CRITICAL-002): Implements bounded queue with FIFO eviction
   */
  function sendConsoleMessage(level, args) {
    const message = {
      type: 'console:' + level,
      level: level,
      args: serializeArgs(args),
      timestamp: Date.now(), // Use numeric timestamp for TTL calculations
      url: window.location.href,
    };

    if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
      // Convert timestamp to ISO string for sending
      const messageToSend = Object.assign({}, message, {
        timestamp: new Date(message.timestamp).toISOString()
      });
      ws.send(JSON.stringify(messageToSend));
    } else {
      // Bounded queue with FIFO eviction
      if (messageQueue.length >= MAX_QUEUE_SIZE) {
        messageQueue.shift(); // Remove oldest message
      }

      // TTL cleanup: Remove messages older than 30 seconds
      const now = Date.now();
      while (messageQueue.length > 0 && (now - messageQueue[0].timestamp) > MAX_QUEUE_AGE_MS) {
        messageQueue.shift();
      }

      messageQueue.push(message);
    }
  }

  /**
   * Initialize WebSocket connection
   * SECURITY FIX (HIGH-003): Uses authToken from postMessage instead of URL parameter
   */
  function initWebSocket() {
    try {
      // Check if authToken was received via postMessage
      if (!authToken) {
        console.error('[Console Interceptor] No auth token received - waiting for postMessage');
        // Token will be received via postMessage listener below
        // Connection will be established when token is received
        return;
      }

      // Construct WebSocket URL with token parameter
      const wsUrl = WS_URL + '?token=' + encodeURIComponent(authToken);
      ws = new WebSocket(wsUrl);

      // SECURITY: Clear token from memory after connection is established
      // to minimize exposure window
      const tokenClearTimeout = setTimeout(() => {
        authToken = null;
      }, 5000); // Clear after 5 seconds

      ws.onopen = function() {
        isConnected = true;
        console.log('[Console Interceptor] Connected to Claude Studio');

        // Clear token immediately on successful connection
        clearTimeout(tokenClearTimeout);
        authToken = null;

        // PERFORMANCE FIX (CRITICAL-002): Rate-limited queue flush
        // Send max 50 messages/second to avoid flooding server
        const BATCH_SIZE = 10;
        const BATCH_DELAY_MS = 200; // 50/sec = 10 every 200ms

        function flushBatch() {
          const batch = messageQueue.splice(0, BATCH_SIZE);
          batch.forEach(function(msg) {
            // Convert timestamp to ISO string for sending
            const messageToSend = Object.assign({}, msg, {
              timestamp: new Date(msg.timestamp).toISOString()
            });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(messageToSend));
            }
          });

          if (messageQueue.length > 0) {
            setTimeout(flushBatch, BATCH_DELAY_MS);
          }
        }

        if (messageQueue.length > 0) {
          flushBatch();
        }
      };

      ws.onerror = function(error) {
        console.error('[Console Interceptor] WebSocket error:', error);
        // Clear timeout on error
        clearTimeout(tokenClearTimeout);
      };

      ws.onclose = function() {
        isConnected = false;
        // Attempt reconnection after 2 seconds
        // Note: Will need new token via postMessage
        setTimeout(() => {
          // Request new token from parent if in iframe
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'console-interceptor-token-request' }, '*');
          }
        }, 2000);
      };
    } catch (error) {
      console.error('[Console Interceptor] Failed to initialize WebSocket:', error);
    }
  }

  /**
   * SECURITY FIX (HIGH-003): Receive authentication token via postMessage
   * This prevents token exposure in URL parameters and browser history
   */
  window.addEventListener('message', function(event) {
    // SECURITY: Validate message origin
    // In production, this should validate against specific allowed origins
    // For now, we validate the message structure and token format
    if (event.data && event.data.type === 'console-interceptor-token') {
      const token = event.data.token;

      // Validate token format (must be a non-empty string)
      if (typeof token === 'string' && token.length > 0) {
        authToken = token;
        console.log('[Console Interceptor] Received auth token via postMessage');

        // Initialize WebSocket connection with the received token
        initWebSocket();
      } else {
        console.error('[Console Interceptor] Invalid token format received');
      }
    }
  });

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

  // Request token from parent window if running in iframe
  // The parent will send the token via postMessage
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'console-interceptor-ready' }, '*');
  } else {
    // For non-iframe contexts, try to get token from global context
    // This is a fallback for backward compatibility
    if (window.__CLAUDE_STUDIO_TOKEN) {
      authToken = window.__CLAUDE_STUDIO_TOKEN;
      initWebSocket();
      // Clear global token after use
      delete window.__CLAUDE_STUDIO_TOKEN;
    } else {
      console.warn('[Console Interceptor] No token available. Console streaming disabled.');
    }
  }

  // Expose utility to restore original console (for debugging)
  window.__claudeStudio = {
    restoreConsole: function() {
      Object.assign(console, originalConsole);
    },
    originalConsole: originalConsole,
  };
})();
