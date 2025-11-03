/**
 * Console Message Sanitizer
 * P08-T004: XSS Prevention for Console Streaming
 *
 * Sanitizes console messages received from browser to prevent:
 * - XSS attacks via malicious console.log content
 * - Code injection in terminal output
 * - HTML entity exploitation
 *
 * CRITICAL SECURITY: All console messages MUST pass through this sanitizer
 * before being sent to the terminal or stored.
 */

/**
 * HTML entity encoding map
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML entities in a string
 */
function escapeHtml(str: string): string {
  if (typeof str !== 'string') {
    return String(str);
  }
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize a single console argument
 * Handles various data types safely
 */
function sanitizeArgument(arg: unknown): unknown {
  // Handle null/undefined
  if (arg === null) return null;
  if (arg === undefined) return undefined;

  // Handle primitives
  if (typeof arg === 'string') {
    return escapeHtml(arg);
  }
  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return arg;
  }

  // Handle special object types (from interceptor.js serialization)
  if (typeof arg === 'object' && arg !== null) {
    const obj = arg as Record<string, unknown>;

    // Error objects
    if (obj.__type === 'error') {
      return {
        __type: 'error',
        message: typeof obj.message === 'string' ? escapeHtml(obj.message) : '',
        stack: typeof obj.stack === 'string' ? escapeHtml(obj.stack) : '',
        name: typeof obj.name === 'string' ? escapeHtml(obj.name) : '',
      };
    }

    // DOM element references
    if (obj.__type === 'element') {
      return {
        __type: 'element',
        tagName: typeof obj.tagName === 'string' ? escapeHtml(obj.tagName) : '',
        id: typeof obj.id === 'string' ? escapeHtml(obj.id) : '',
        className: typeof obj.className === 'string' ? escapeHtml(obj.className) : '',
      };
    }

    // Circular references
    if (obj.__type === 'circular') {
      return {
        __type: 'circular',
        preview: typeof obj.preview === 'string' ? escapeHtml(obj.preview) : '',
      };
    }

    // Function references
    if (obj.__type === 'function') {
      return {
        __type: 'function',
        name: typeof obj.name === 'string' ? escapeHtml(obj.name) : '',
      };
    }

    // Regular objects/arrays: recursively sanitize
    if (Array.isArray(obj)) {
      return obj.map(sanitizeArgument);
    }

    // Plain objects: sanitize all values
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize both key and value
      const safeKey = escapeHtml(String(key));
      sanitized[safeKey] = sanitizeArgument(value);
    }
    return sanitized;
  }

  // Fallback: convert to safe string
  return escapeHtml(String(arg));
}

/**
 * Console message structure (from browser)
 */
export interface ConsoleMessage {
  type: 'console:log' | 'console:warn' | 'console:error' | 'console:info' | 'console:debug';
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
  timestamp: string;
  url?: string;
}

/**
 * Sanitized console message (safe for terminal/storage)
 */
export interface SanitizedConsoleMessage {
  type: 'console:log' | 'console:warn' | 'console:error' | 'console:info' | 'console:debug';
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
  timestamp: string;
  url?: string;
  sanitized: true; // Flag to indicate this has been sanitized
}

/**
 * Validate message format
 * Ensures the message conforms to expected structure
 */
function validateMessageFormat(message: unknown): message is ConsoleMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Partial<ConsoleMessage>;

  // Check required fields
  if (typeof msg.type !== 'string') return false;
  if (!msg.type.startsWith('console:')) return false;
  if (typeof msg.level !== 'string') return false;
  if (!['log', 'warn', 'error', 'info', 'debug'].includes(msg.level)) return false;
  if (!Array.isArray(msg.args)) return false;
  if (typeof msg.timestamp !== 'string') return false;

  // URL is optional but must be string if present
  if (msg.url !== undefined && typeof msg.url !== 'string') return false;

  return true;
}

/**
 * Sanitize a console message from the browser
 *
 * CRITICAL: This function MUST be called on ALL console messages
 * before they are:
 * - Sent to the terminal
 * - Stored in memory/database
 * - Forwarded to other clients
 *
 * @param message - Raw console message from browser
 * @returns Sanitized message or null if invalid
 */
export function sanitizeConsoleMessage(message: unknown): SanitizedConsoleMessage | null {
  // Validate format first
  if (!validateMessageFormat(message)) {
    console.error('[Security] Invalid console message format', message);
    return null;
  }

  // Sanitize all arguments
  const sanitizedArgs = message.args.map(sanitizeArgument);

  // Sanitize URL if present
  const sanitizedUrl = message.url ? escapeHtml(message.url) : undefined;

  return {
    type: message.type,
    level: message.level,
    args: sanitizedArgs,
    timestamp: message.timestamp,
    url: sanitizedUrl,
    sanitized: true,
  };
}

/**
 * Format sanitized message for terminal display
 * Converts sanitized arguments to human-readable string
 */
export function formatForTerminal(message: SanitizedConsoleMessage): string {
  const prefix = `[${message.level.toUpperCase()}]`;
  const timestamp = new Date(message.timestamp).toLocaleTimeString();

  // Format arguments as string
  const formattedArgs = message.args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);

    // Handle special types
    if (typeof arg === 'object' && arg !== null) {
      const obj = arg as Record<string, unknown>;
      if (obj.__type === 'error') {
        return `Error: ${obj.message}`;
      }
      if (obj.__type === 'element') {
        return `<${obj.tagName}${obj.id ? `#${obj.id}` : ''}${obj.className ? `.${obj.className}` : ''}>`;
      }
      if (obj.__type === 'circular') {
        return `[Circular: ${obj.preview}]`;
      }
      if (obj.__type === 'function') {
        return `[Function: ${obj.name}]`;
      }

      // Regular object: JSON stringify (already sanitized)
      try {
        return JSON.stringify(obj, null, 2);
      } catch {
        return '[Object]';
      }
    }

    return String(arg);
  }).join(' ');

  return `${prefix} [${timestamp}] ${formattedArgs}`;
}

/**
 * Test helper: Check if a string contains potential XSS
 * Used in tests to verify sanitization
 */
export function containsPotentialXSS(str: string): boolean {
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror=/i,
    /onclick=/i,
    /onload=/i,
    /<iframe/i,
    /eval\(/i,
    /alert\(/i,
  ];

  return xssPatterns.some(pattern => pattern.test(str));
}
