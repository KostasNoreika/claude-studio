/**
 * WebSocket Message Types for Claude Studio
 *
 * This module defines the type-safe message protocol for WebSocket
 * communication between the client terminal and the server.
 *
 * All messages use discriminated unions with a 'type' field for
 * runtime type checking and TypeScript type narrowing.
 */

// ============================================================================
// CLIENT MESSAGES (Client → Server)
// ============================================================================

/**
 * Message sent when user types input in the terminal
 *
 * @example
 * {
 *   type: 'terminal:input',
 *   data: 'ls -la\n',
 *   timestamp: '2025-11-02T12:00:00.000Z'
 * }
 */
export interface TerminalInputMessage {
  type: 'terminal:input';
  /** The command or input data from the terminal */
  data: string;
  /** ISO8601 timestamp when the input was sent */
  timestamp: string;
}

/**
 * Heartbeat message to keep the WebSocket connection alive
 *
 * Sent periodically by the client to prevent connection timeout.
 *
 * @example
 * {
 *   type: 'heartbeat',
 *   timestamp: '2025-11-02T12:00:00.000Z'
 * }
 */
export interface HeartbeatMessage {
  type: 'heartbeat';
  /** ISO8601 timestamp when the heartbeat was sent */
  timestamp: string;
}

/**
 * Message to request reconnection to an existing session
 *
 * Sent by client when reconnecting to re-attach to a previous container session.
 *
 * @example
 * {
 *   type: 'session:reconnect',
 *   sessionId: 'sess_a1b2c3d4e5f6',
 *   timestamp: '2025-11-02T12:00:00.000Z'
 * }
 */
export interface SessionReconnectMessage {
  type: 'session:reconnect';
  /** Session ID to reconnect to */
  sessionId: string;
  /** ISO8601 timestamp when the reconnect was requested */
  timestamp: string;
}

/**
 * Message to create a new session with specified workspace
 *
 * Sent by client when switching projects or starting work on a specific project.
 *
 * @example
 * {
 *   type: 'session:create',
 *   workspacePath: '/opt/dev/KAGI-AI',
 *   projectName: 'KAGI-AI',
 *   timestamp: '2025-11-04T12:00:00.000Z'
 * }
 */
export interface SessionCreateMessage {
  type: 'session:create';
  /** Workspace path to work in */
  workspacePath: string;
  /** Optional project name */
  projectName?: string;
  /** ISO8601 timestamp when the session create was requested */
  timestamp: string;
}

/**
 * All messages that can be sent from client to server
 *
 * This discriminated union ensures type safety when handling
 * incoming client messages on the server side.
 */
export type ClientMessage =
  | TerminalInputMessage
  | HeartbeatMessage
  | SessionReconnectMessage
  | SessionCreateMessage;

// ============================================================================
// SERVER MESSAGES (Server → Client)
// ============================================================================

/**
 * Message containing terminal output to display to the user
 *
 * @example
 * {
 *   type: 'terminal:output',
 *   data: 'total 48\ndrwxr-xr-x  6 user  staff  192 Nov  2 12:00 .\n',
 *   timestamp: '2025-11-02T12:00:00.500Z'
 * }
 */
export interface TerminalOutputMessage {
  type: 'terminal:output';
  /** The output data from the terminal (stdout/stderr) */
  data: string;
  /** ISO8601 timestamp when the output was generated */
  timestamp: string;
}

/**
 * Message sent when WebSocket connection is successfully established
 *
 * @example
 * {
 *   type: 'connected',
 *   sessionId: 'sess_a1b2c3d4e5f6',
 *   timestamp: '2025-11-02T12:00:00.000Z'
 * }
 */
export interface ConnectedMessage {
  type: 'connected';
  /** Unique session identifier for this connection */
  sessionId: string;
  /** ISO8601 timestamp when the connection was established */
  timestamp: string;
}

/**
 * Message sent when an error occurs on the server
 * P03-T009: Enhanced with error codes and retry information
 *
 * @example
 * {
 *   type: 'error',
 *   message: 'Terminal process crashed',
 *   code: 'CONTAINER_EXECUTION_FAILED',
 *   retryable: false,
 *   timestamp: '2025-11-02T12:00:01.000Z'
 * }
 */
export interface ErrorMessage {
  type: 'error';
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the operation can be retried */
  retryable?: boolean;
  /** ISO8601 timestamp when the error occurred */
  timestamp: string;
  /** Additional context (debug info, never sensitive data) */
  context?: Record<string, unknown>;
}

/**
 * Message sent when preview URL is ready for a session
 * P06-T005: Preview URL notification
 *
 * @example
 * {
 *   type: 'preview:url',
 *   sessionId: 'sess_a1b2c3d4e5f6',
 *   url: '/preview/sess_a1b2c3d4e5f6',
 *   port: 5173,
 *   timestamp: '2025-11-02T12:00:00.000Z'
 * }
 */
export interface PreviewUrlMessage {
  type: 'preview:url';
  /** Session ID this preview URL is for */
  sessionId: string;
  /** Preview URL path (relative to server) */
  url: string;
  /** Port the preview is proxying to */
  port: number;
  /** ISO8601 timestamp when the preview URL was created */
  timestamp: string;
}

/**
 * Message sent when file changes detected and preview should reload
 * P07-T004: Preview reload notification
 *
 * @example
 * {
 *   type: 'preview:reload',
 *   sessionId: 'sess_a1b2c3d4e5f6',
 *   changedFiles: ['/workspace/index.html', '/workspace/style.css'],
 *   timestamp: '2025-11-02T12:00:00.000Z'
 * }
 */
export interface PreviewReloadMessage {
  type: 'preview:reload';
  /** Session ID this reload is for */
  sessionId: string;
  /** List of changed file paths (for debugging) */
  changedFiles: string[];
  /** ISO8601 timestamp when the reload was triggered */
  timestamp: string;
}

/**
 * Message sent when browser console.log is captured
 * P08-T003: Console streaming
 *
 * @example
 * {
 *   type: 'console:log',
 *   level: 'log',
 *   args: ['Hello', 'world'],
 *   timestamp: '2025-11-02T12:00:00.000Z',
 *   url: 'http://localhost:5173/'
 * }
 */
export interface ConsoleLogMessage {
  type: 'console:log';
  /** Console level */
  level: 'log';
  /** Console arguments (sanitized) */
  args: unknown[];
  /** ISO8601 timestamp when logged */
  timestamp: string;
  /** URL where log occurred (optional) */
  url?: string;
}

/**
 * Message sent when browser console.warn is captured
 * P08-T003: Console streaming
 */
export interface ConsoleWarnMessage {
  type: 'console:warn';
  level: 'warn';
  args: unknown[];
  timestamp: string;
  url?: string;
}

/**
 * Message sent when browser console.error is captured
 * P08-T003: Console streaming
 */
export interface ConsoleErrorMessage {
  type: 'console:error';
  level: 'error';
  args: unknown[];
  timestamp: string;
  url?: string;
  /** Stack trace (if error object) */
  stack?: string;
}

/**
 * All console message types
 */
export type ConsoleMessage =
  | ConsoleLogMessage
  | ConsoleWarnMessage
  | ConsoleErrorMessage;

/**
 * All messages that can be sent from server to client
 *
 * This discriminated union ensures type safety when handling
 * incoming server messages on the client side.
 */
export type ServerMessage =
  | TerminalOutputMessage
  | ConnectedMessage
  | ErrorMessage
  | PreviewUrlMessage
  | PreviewReloadMessage
  | ConsoleLogMessage
  | ConsoleWarnMessage
  | ConsoleErrorMessage;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a message is a ClientMessage
 */
export function isClientMessage(message: unknown): message is ClientMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as { type?: string };
  return msg.type === 'terminal:input' || msg.type === 'heartbeat' || msg.type === 'session:reconnect' || msg.type === 'session:create';
}

/**
 * Type guard to check if a message is a ServerMessage
 */
export function isServerMessage(message: unknown): message is ServerMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as { type?: string };
  return (
    msg.type === 'terminal:output' ||
    msg.type === 'connected' ||
    msg.type === 'error' ||
    msg.type === 'preview:url' ||
    msg.type === 'preview:reload' ||
    msg.type === 'console:log' ||
    msg.type === 'console:warn' ||
    msg.type === 'console:error'
  );
}

/**
 * Type guard to check if a message is a ConsoleMessage
 */
export function isConsoleMessage(message: unknown): message is ConsoleMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as { type?: string };
  return (
    msg.type === 'console:log' ||
    msg.type === 'console:warn' ||
    msg.type === 'console:error'
  );
}

// ============================================================================
// MESSAGE FACTORIES
// ============================================================================

/**
 * Helper function to create a properly typed TerminalInputMessage
 */
export function createTerminalInputMessage(data: string): TerminalInputMessage {
  return {
    type: 'terminal:input',
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to create a properly typed HeartbeatMessage
 */
export function createHeartbeatMessage(): HeartbeatMessage {
  return {
    type: 'heartbeat',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to create a properly typed TerminalOutputMessage
 */
export function createTerminalOutputMessage(data: string): TerminalOutputMessage {
  return {
    type: 'terminal:output',
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to create a properly typed ConnectedMessage
 */
export function createConnectedMessage(sessionId: string): ConnectedMessage {
  return {
    type: 'connected',
    sessionId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to create a properly typed ErrorMessage
 * P03-T009: Enhanced with error codes and retry information
 */
export function createErrorMessage(
  message: string,
  code?: string,
  retryable?: boolean,
  context?: Record<string, unknown>
): ErrorMessage {
  return {
    type: 'error',
    message,
    code,
    retryable,
    timestamp: new Date().toISOString(),
    context,
  };
}

/**
 * Helper function to create a properly typed SessionReconnectMessage
 */
export function createSessionReconnectMessage(sessionId: string): SessionReconnectMessage {
  return {
    type: 'session:reconnect',
    sessionId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to create a properly typed SessionCreateMessage
 */
export function createSessionCreateMessage(workspacePath: string, projectName?: string): SessionCreateMessage {
  return {
    type: 'session:create',
    workspacePath,
    projectName,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to create a properly typed PreviewUrlMessage
 * P06-T005: Preview URL notification
 */
export function createPreviewUrlMessage(
  sessionId: string,
  url: string,
  port: number
): PreviewUrlMessage {
  return {
    type: 'preview:url',
    sessionId,
    url,
    port,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to create a properly typed PreviewReloadMessage
 * P07-T004: Preview reload notification
 */
export function createPreviewReloadMessage(
  sessionId: string,
  changedFiles: string[]
): PreviewReloadMessage {
  return {
    type: 'preview:reload',
    sessionId,
    changedFiles,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// MCP INTEGRATION TYPES
// ============================================================================

/**
 * MCP Status Response
 *
 * Returned by GET /api/mcp/status endpoint
 * Provides information about Chrome DevTools MCP integration availability
 *
 * The backend detects:
 * - MCP_ENABLED configuration setting
 * - Chrome debug port (default 9223)
 * - Whether Chrome is currently running and accessible
 *
 * @example
 * {
 *   "enabled": true,
 *   "chromeDebugPort": 9223,
 *   "chromeAvailable": true
 * }
 */
export interface MCPStatusResponse {
  /** Whether MCP integration is enabled in configuration */
  enabled: boolean;
  /** Port where Chrome DevTools Protocol is expected */
  chromeDebugPort: number;
  /** Whether Chrome is currently running and accessible via CDP */
  chromeAvailable: boolean;
}

/**
 * MCP Configuration Response
 *
 * Returned by GET /api/mcp/config endpoint
 * Provides MCP configuration information with human-readable description
 */
export interface MCPConfigResponse {
  /** Whether MCP integration is enabled */
  enabled: boolean;
  /** Chrome debug port */
  chromeDebugPort: number;
  /** Human-readable description of MCP status */
  description: string;
}
