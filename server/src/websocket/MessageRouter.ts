/**
 * Message Router
 * Extracted from handler.ts for better separation of concerns
 *
 * Responsibilities:
 * - Route incoming messages to appropriate handlers
 * - Message validation and sanitization
 * - Handler registry pattern
 */

import { WebSocket } from 'ws';
import { ClientMessage, createErrorMessage } from '@shared';
import { containerManager } from '../docker/ContainerManager';
import { sanitizeConsoleMessage } from '../security/console-sanitizer';
import { logger } from '../utils/logger';
import { sessionManager, SessionState } from '../session/SessionManager';

/**
 * Message handler function type
 */
type MessageHandler = (
  ws: WebSocket,
  data: unknown,
  sessionId: string,
  state: SessionState
) => Promise<void> | void;

/**
 * SECURITY FIX (HIGH-001): Rate limiting configuration for message flooding prevention
 */
const MESSAGE_RATE_LIMIT = {
  WINDOW_MS: 1000, // 1 second window
  MAX_MESSAGES: 100, // Max 100 messages per second per connection
  BURST_SIZE: 20, // Allow bursts of 20 messages
};

/**
 * Rate limiter state for a connection
 */
interface RateLimitState {
  tokens: number; // Current available tokens
  lastRefill: number; // Timestamp of last token refill
}

/**
 * MessageRouter class
 * Routes WebSocket messages to appropriate handlers
 * SECURITY FIX (HIGH-001): Implements per-connection rate limiting
 */
export class MessageRouter {
  private handlers: Map<string, MessageHandler>;
  private rateLimiters: Map<string, RateLimitState>; // sessionId -> rate limit state

  constructor() {
    this.handlers = new Map();
    this.rateLimiters = new Map();
    this.registerHandlers();

    // Cleanup rate limiter state every 5 minutes
    setInterval(() => this.cleanupRateLimiters(), 5 * 60 * 1000);
  }

  /**
   * Clean up rate limiter state for disconnected sessions
   */
  private cleanupRateLimiters(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, state] of this.rateLimiters.entries()) {
      // Remove if inactive for more than 5 minutes
      if (now - state.lastRefill > 5 * 60 * 1000) {
        this.rateLimiters.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Rate limiter cleanup completed', {
        cleanedSessions: cleanedCount,
        remainingSessions: this.rateLimiters.size,
      });
    }
  }

  /**
   * Check if message should be rate limited
   * Uses token bucket algorithm for burst support
   *
   * @returns true if message is allowed, false if rate limited
   */
  private checkRateLimit(sessionId: string): boolean {
    const now = Date.now();
    let state = this.rateLimiters.get(sessionId);

    if (!state) {
      // Initialize new rate limiter for this session
      state = {
        tokens: MESSAGE_RATE_LIMIT.BURST_SIZE,
        lastRefill: now,
      };
      this.rateLimiters.set(sessionId, state);
    }

    // Refill tokens based on elapsed time (token bucket algorithm)
    const elapsed = now - state.lastRefill;
    const tokensToAdd = Math.floor(
      (elapsed / MESSAGE_RATE_LIMIT.WINDOW_MS) * MESSAGE_RATE_LIMIT.MAX_MESSAGES
    );

    if (tokensToAdd > 0) {
      state.tokens = Math.min(
        MESSAGE_RATE_LIMIT.BURST_SIZE,
        state.tokens + tokensToAdd
      );
      state.lastRefill = now;
    }

    // Check if we have tokens available
    if (state.tokens > 0) {
      state.tokens--;
      return true; // Allow message
    }

    return false; // Rate limited
  }

  /**
   * Route a message to the appropriate handler
   * SECURITY FIX (HIGH-001): Implements rate limiting
   */
  async route(ws: WebSocket, message: ClientMessage, sessionId: string): Promise<void> {
    // SECURITY: Check rate limit first
    if (!this.checkRateLimit(sessionId)) {
      logger.warn('Message rate limit exceeded', {
        sessionId,
        messageType: message.type,
      });

      const errorMsg = createErrorMessage(
        'Rate limit exceeded. Too many messages.',
        'RATE_LIMIT_EXCEEDED',
        false
      );
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errorMsg));
      }
      return;
    }

    const state = sessionManager.getSession(sessionId);
    if (!state) {
      logger.warn('Session not found for message handling', { sessionId });
      return;
    }

    // Handle console messages (special case with prefix matching)
    if (message.type && message.type.startsWith('console:')) {
      await this.handleConsoleMessage(ws, message, sessionId, state);
      return;
    }

    // Route to specific handler
    const handler = this.handlers.get(message.type);
    if (handler) {
      await handler(ws, message, sessionId, state);
    } else {
      // Unknown message type
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
   * Register all message handlers
   */
  private registerHandlers(): void {
    this.handlers.set('terminal:input', this.handleTerminalInput.bind(this));
    this.handlers.set('heartbeat', this.handleHeartbeat.bind(this));
    this.handlers.set('session:reconnect', this.handleSessionReconnect.bind(this));
  }

  /**
   * Handle terminal input message
   */
  private handleTerminalInput(
    _ws: WebSocket,
    message: unknown,
    sessionId: string,
    state: SessionState
  ): void {
    const msg = message as { type: 'terminal:input'; data: string };

    logger.debug('Terminal input received', {
      sessionId,
      dataLength: msg.data.length,
    });

    containerManager.writeToContainerStdin(state.containerId, msg.data, state.stdin);
  }

  /**
   * Handle heartbeat message
   */
  private handleHeartbeat(
    _ws: WebSocket,
    _message: unknown,
    sessionId: string,
    _state: SessionState
  ): void {
    logger.debug('Heartbeat received', { sessionId });

    // Update last activity
    sessionManager.updateActivity(sessionId);
  }

  /**
   * Handle session reconnect message
   */
  private handleSessionReconnect(
    _ws: WebSocket,
    _message: unknown,
    sessionId: string,
    _state: SessionState
  ): void {
    // Reconnection is handled in handleConnection before reaching here
    // This case should not normally be reached, but included for completeness
    logger.warn('Reconnect message received after session initialized', { sessionId });
  }

  /**
   * Handle console messages from browser
   * SECURITY CRITICAL: All console messages are sanitized before forwarding
   */
  private handleConsoleMessage(
    ws: WebSocket,
    message: unknown,
    sessionId: string,
    _state: SessionState
  ): void {
    // Sanitize the console message (XSS prevention)
    const sanitized = sanitizeConsoleMessage(message);

    if (!sanitized) {
      logger.error('Invalid console message format, dropping', { sessionId });
      return;
    }

    logger.debug('Console message received from browser', {
      sessionId,
      level: sanitized.level,
      argsPreview: JSON.stringify(sanitized.args).substring(0, 100),
    });

    // Broadcast to client (already sanitized)
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(sanitized));
    }
  }
}

// Singleton instance
export const messageRouter = new MessageRouter();
