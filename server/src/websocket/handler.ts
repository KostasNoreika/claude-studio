/**
 * WebSocket Connection Handler - P03-T006 + P03-T007 + P03-T009 + P07-T004
 *
 * Handles individual WebSocket connections, Docker container I/O,
 * message routing, and session management with reconnection support.
 *
 * P03-T006: Replace WebSocket echo with Docker container I/O
 * - On connection: create container session via ContainerManager
 * - On terminal:input: write to container stdin
 * - Container stdout/stderr → send as terminal:output via WebSocket
 * - On close: stop container session
 *
 * P03-T007: Re-attachment logic
 * - Support sessionId in initial message for reconnection
 * - If session exists and container running: reattach to existing
 * - If session exists but container stopped: recreate or error
 * - Clean up old stream handlers before attaching new client
 *
 * P03-T009: Container lifecycle error handling
 * - Typed errors with user-friendly messages
 * - Error codes for client-side handling
 * - Retry logic for transient failures
 *
 * P07-T004: Broadcast reload signal via WebSocket
 * - When file changes detected, send preview:reload message
 * - Include changed file paths for debugging
 */

import { WebSocket } from 'ws';
import {
  ClientMessage,
  ServerMessage,
  createConnectedMessage,
  createTerminalOutputMessage,
  createErrorMessage,
  createPreviewReloadMessage,
  isClientMessage,
} from '@shared';
import { containerManager } from '../docker/ContainerManager';
import { ContainerConfig } from '../docker/types';
import { Readable } from 'stream';
import { ContainerError } from '../docker/errors';
import { sanitizeConsoleMessage } from '../security/console-sanitizer';

// Map to track session state and streams
interface SessionState {
  sessionId: string;
  containerId: string;
  stdin: any;
  stdout: Readable;
  stderr: Readable;
  outputHandler: (data: string) => void;
  isReconnected: boolean; // Track if this is a reconnected session
  ws: WebSocket; // P07-T004: Store WebSocket for reload broadcasts
}

const sessionStates = new Map<string, SessionState>();

/**
 * Handle a new WebSocket connection
 *
 * Creates container session, sets up message handlers, sends connection confirmation,
 * and manages the connection lifecycle. Supports reconnection to existing sessions.
 */
export async function handleConnection(ws: WebSocket): Promise<void> {
  let currentSessionId: string | null = null;
  let sessionInitialized = false;

  console.log(`🔌 New WebSocket connection`);

  // Handle incoming messages
  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (!isClientMessage(message)) {
        const errorMsg = createErrorMessage(
          'Invalid message format',
          'INVALID_MESSAGE_FORMAT',
          false
        );
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(errorMsg));
        }
        return;
      }

      // Handle session:reconnect message before session is initialized
      if (message.type === 'session:reconnect' && !sessionInitialized) {
        console.log(`🔄 Reconnect request for session: ${message.sessionId}`);
        const success = await handleReconnect(ws, message.sessionId);
        if (success) {
          currentSessionId = message.sessionId;
          sessionInitialized = true;
        }
        return;
      }

      // If session not initialized yet, initialize a new one
      if (!sessionInitialized) {
        const newSessionId = await initializeNewSession(ws);
        if (newSessionId) {
          currentSessionId = newSessionId;
          sessionInitialized = true;
        } else {
          return; // Failed to initialize, error already sent
        }
      }

      // Handle regular messages
      if (currentSessionId) {
        handleClientMessage(ws, currentSessionId, message);
      }
    } catch (error) {
      console.error('[WebSocket] Message parsing error:', error);
      const errorMsg = createErrorMessage(
        'Failed to parse message',
        'MESSAGE_PARSE_ERROR',
        false
      );
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errorMsg));
      }
    }
  });

  // Handle close
  ws.on('close', async () => {
    if (currentSessionId) {
      console.log(`❌ [${currentSessionId}] disconnected`);
      // Note: Do NOT stop container on disconnect - allow reconnection
      // Container cleanup will happen via timeout mechanism or explicit stop
      const state = sessionStates.get(currentSessionId);
      if (state) {
        // Clean up stream listeners but keep session alive
        cleanupStreamHandlers(state);
      }
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`⚠️  WebSocket error:`, error.message);
  });
}

/**
 * Initialize a new container session
 * P03-T009: Enhanced error handling with typed errors
 * Returns sessionId on success, null on failure
 */
async function initializeNewSession(ws: WebSocket): Promise<string | null> {
  const sessionId = generateSessionId();
  console.log(`[WebSocket] Creating new session: ${sessionId}`);

  try {
    // Create container session
    const config: ContainerConfig = {
      projectName: 'terminal-session',
      workspacePath: '/tmp',
      image: 'ubuntu:latest',
      env: {
        TERM: 'xterm-256color',
        LANG: 'en_US.UTF-8',
      },
    };

    const session = await containerManager.createSession(config);

    // Get container streams for I/O
    const streams = await containerManager.attachToContainerStreams(session.containerId);

    // Attach streams and create session state
    await attachStreamsToWebSocket(ws, sessionId, session.containerId, streams, false);

    // Send connection confirmation
    const connectedMsg = createConnectedMessage(sessionId);
    ws.send(JSON.stringify(connectedMsg));
    console.log(`[WebSocket] Session initialized: ${sessionId}`);

    return sessionId;
  } catch (error) {
    console.error(`[WebSocket] Failed to create session: ${sessionId}`, error);

    // Convert to user-friendly error message
    let errorMsg;
    if (error instanceof ContainerError) {
      errorMsg = createErrorMessage(
        error.toUserMessage(),
        error.code,
        error.retryable,
        { sessionId }
      );
    } else {
      errorMsg = createErrorMessage(
        'Failed to initialize container. Please try again.',
        'CONTAINER_CREATION_FAILED',
        true,
        { sessionId }
      );
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorMsg));
    }
    ws.close();
    return null;
  }
}

/**
 * Handle reconnection to an existing session
 * P03-T009: Enhanced error handling with typed errors
 * Returns true on success, false on failure
 */
async function handleReconnect(ws: WebSocket, sessionId: string): Promise<boolean> {
  // Check if session exists
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.warn(`[WebSocket] Session not found: ${sessionId}`);
    const errorMsg = createErrorMessage(
      'Session not found. It may have expired. Please start a new session.',
      'SESSION_NOT_FOUND',
      false,
      { sessionId }
    );
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorMsg));
    }
    return false;
  }

  // Check if container is still running
  const isRunning = await containerManager.isContainerRunning(state.containerId);
  if (!isRunning) {
    console.error(`[WebSocket] Container not running for session: ${sessionId}`);
    const errorMsg = createErrorMessage(
      'Session container stopped. Please start a new session.',
      'CONTAINER_NOT_FOUND',
      false,
      { sessionId }
    );
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorMsg));
    }
    // Clean up stale session
    sessionStates.delete(sessionId);
    return false;
  }

  try {
    // Clean up old stream handlers
    cleanupStreamHandlers(state);

    // Re-attach to container streams
    const streams = await containerManager.attachToContainerStreams(state.containerId);

    // Attach streams to new WebSocket
    await attachStreamsToWebSocket(ws, sessionId, state.containerId, streams, true);

    // Send connection confirmation
    const connectedMsg = createConnectedMessage(sessionId);
    ws.send(JSON.stringify(connectedMsg));
    console.log(`[WebSocket] Session reconnected: ${sessionId}`);

    return true;
  } catch (error) {
    console.error(`[WebSocket] Failed to reconnect: ${sessionId}`, error);

    // Convert to user-friendly error message
    let errorMsg;
    if (error instanceof ContainerError) {
      errorMsg = createErrorMessage(
        error.toUserMessage(),
        error.code,
        error.retryable,
        { sessionId }
      );
    } else {
      errorMsg = createErrorMessage(
        'Failed to reconnect to session. Please try again.',
        'RECONNECTION_FAILED',
        true,
        { sessionId }
      );
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorMsg));
    }
    return false;
  }
}

/**
 * Attach container streams to WebSocket and store session state
 * P07-T004: Attach file watcher listener for reload broadcasts
 */
async function attachStreamsToWebSocket(
  ws: WebSocket,
  sessionId: string,
  containerId: string,
  streams: { stdin: any; stdout: Readable; stderr: Readable },
  isReconnected: boolean
): Promise<void> {
  // Create output handler
  const outputHandler = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      const outputMsg = createTerminalOutputMessage(data);
      ws.send(JSON.stringify(outputMsg));
      console.log(`📤 [${sessionId}] sent output (${data.length} bytes)`);
    }
  };

  // Store session state
  sessionStates.set(sessionId, {
    sessionId,
    containerId,
    stdin: streams.stdin,
    stdout: streams.stdout,
    stderr: streams.stderr,
    outputHandler,
    isReconnected,
    ws, // Store WebSocket reference
  });

  // Attach output handler to stdout/stderr
  streams.stdout.on('data', (chunk: Buffer) => {
    outputHandler(chunk.toString('utf-8'));
  });

  streams.stderr.on('data', (chunk: Buffer) => {
    outputHandler(chunk.toString('utf-8'));
  });

  // P07-T004: Attach file watcher reload handler
  const session = containerManager.getSession(sessionId);
  if (session?.fileWatcher) {
    // Remove existing listeners first (for reconnections)
    session.fileWatcher.removeAllListeners('reload');

    // Add reload listener
    session.fileWatcher.on('reload', (changedFiles: string[]) => {
      console.log(`🔄 [${sessionId}] File changes detected, sending reload signal`);
      console.log(`   Changed files: ${changedFiles.join(', ')}`);

      if (ws.readyState === WebSocket.OPEN) {
        const reloadMsg = createPreviewReloadMessage(sessionId, changedFiles);
        ws.send(JSON.stringify(reloadMsg));
      }
    });

    console.log(`[WebSocket] Attached file watcher reload handler for session: ${sessionId}`);
  }
}

/**
 * Clean up stream handlers to prevent memory leaks on reconnection
 */
function cleanupStreamHandlers(state: SessionState): void {
  try {
    // Remove all listeners from stdout/stderr
    state.stdout.removeAllListeners('data');
    state.stderr.removeAllListeners('data');
    console.log(`🧹 [${state.sessionId}] cleaned up old stream handlers`);
  } catch (error) {
    console.error(`Failed to cleanup stream handlers for ${state.sessionId}:`, error);
  }
}

/**
 * Handle client messages based on message type
 * P08-T007: Added console message handling
 */
function handleClientMessage(
  ws: WebSocket,
  sessionId: string,
  message: ClientMessage | any
): void {
  const state = sessionStates.get(sessionId);
  if (!state) {
    console.warn(`⚠️  Session not found: ${sessionId}`);
    return;
  }

  // P08-T007: Handle console messages from browser
  if (message.type && message.type.startsWith('console:')) {
    handleConsoleMessage(ws, sessionId, message);
    return;
  }

  switch (message.type) {
    case 'terminal:input':
      // Write input to container stdin
      console.log(`📥 [${sessionId}] terminal:input: "${message.data.substring(0, 50)}${message.data.length > 50 ? '...' : ''}"`);
      containerManager.writeToContainerStdin(state.containerId, message.data, state.stdin);
      break;

    case 'heartbeat':
      // Log heartbeat (no response needed)
      console.log(`💓 [${sessionId}] heartbeat received`);
      // Update last activity
      const session = containerManager.getSession(sessionId);
      if (session) {
        containerManager.updateActivity(sessionId);
      }
      break;

    case 'session:reconnect':
      // Reconnection is handled in handleConnection before reaching here
      // This case should not normally be reached, but included for completeness
      console.log(`⚠️  [${sessionId}] session:reconnect received after session initialized (ignored)`);
      break;

    default:
      // TypeScript should catch this, but handle unknown types
      const errorMsg = createErrorMessage(
        'Unknown message type',
        'UNKNOWN_MESSAGE_TYPE',
        false
      );
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errorMsg));
      }
  }
}

/**
 * Handle console messages from browser
 * P08-T007: Console message handling with XSS sanitization
 *
 * SECURITY CRITICAL: All console messages are sanitized before forwarding
 */
function handleConsoleMessage(
  ws: WebSocket,
  sessionId: string,
  message: unknown
): void {
  // Sanitize the console message (XSS prevention)
  const sanitized = sanitizeConsoleMessage(message);

  if (!sanitized) {
    console.error(`[${sessionId}] Invalid console message format, dropping`);
    return;
  }

  console.log(`🖥️  [${sessionId}] console.${sanitized.level}: ${JSON.stringify(sanitized.args).substring(0, 100)}`);

  // Broadcast to client (already sanitized)
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(sanitized));
  }
}

/**
 * Generate a unique session ID
 *
 * Format: sess_<timestamp>_<random>
 * Example: sess_1730544000000_a1b2c3d4e
 */
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
