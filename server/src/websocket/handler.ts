/**
 * WebSocket Connection Handler - Refactored
 *
 * Orchestrates WebSocket connections using specialized modules:
 * - SessionManager: Session lifecycle management
 * - MessageRouter: Message routing and handling
 * - StreamManager: Docker stream attachment and management
 *
 * This is a thin orchestration layer that delegates to specialized modules.
 *
 * Original tasks implemented:
 * P03-T006: Replace WebSocket echo with Docker container I/O
 * P03-T007: Re-attachment logic
 * P03-T009: Container lifecycle error handling
 * P07-T004: Broadcast reload signal via WebSocket
 * P08-T007: Console message handling
 */

import { WebSocket } from 'ws';
import {
  ClientMessage,
  isClientMessage,
  createErrorMessage,
} from '@shared';
import { sessionManager } from '../session/SessionManager';
import { messageRouter } from './MessageRouter';
import { containerManager } from '../docker/ContainerManager';
import { logger } from '../utils/logger';

/**
 * Handle a new WebSocket connection
 *
 * Creates container session, sets up message handlers, sends connection confirmation,
 * and manages the connection lifecycle. Supports reconnection to existing sessions.
 */
export async function handleConnection(ws: WebSocket): Promise<void> {
  let currentSessionId: string | null = null;

  logger.info('New WebSocket connection established');

  // Initialize new session immediately upon connection
  // This prevents deadlock where client waits for 'connected' message
  // and server waits for client to send first message
  const newSessionId = await sessionManager.createSession(ws);
  if (newSessionId) {
    currentSessionId = newSessionId;
  } else {
    // Failed to initialize, error already sent, close connection
    ws.close();
    return;
  }

  // Handle incoming messages
  ws.on('message', async (data: Buffer) => {
    try {
      const parsed: unknown = JSON.parse(data.toString());

      if (!isClientMessage(parsed)) {
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

      const message: ClientMessage = parsed;

      // Handle session:reconnect message (shouldn't happen since we init immediately)
      if (message.type === 'session:reconnect') {
        logger.warn('Unexpected reconnect message on new connection', {
          sessionId: message.sessionId,
          currentSessionId,
        });
        return;
      }

      // Handle session:create message - create new session with specified workspace
      if (message.type === 'session:create') {
        logger.info('Session create requested', {
          workspacePath: message.workspacePath,
          projectName: message.projectName,
          currentSessionId,
        });

        // Stop current session if exists
        if (currentSessionId) {
          try {
            await containerManager.stopSession(currentSessionId);
          } catch (error) {
            logger.warn('Failed to stop current session', { currentSessionId, error });
          }
        }

        // Create new session with specified workspace
        const newSessionId = await sessionManager.createSession(
          ws,
          message.workspacePath,
          message.projectName
        );
        if (newSessionId) {
          currentSessionId = newSessionId;
        } else {
          // Failed to create session, close connection
          ws.close();
        }
        return;
      }

      // Handle regular messages via MessageRouter
      if (currentSessionId) {
        await messageRouter.route(ws, message, currentSessionId);
      }
    } catch (error) {
      logger.error('WebSocket message parsing error', { error });
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
      logger.info('WebSocket connection closed', { sessionId: currentSessionId });
      // Note: Do NOT stop container on disconnect - allow reconnection
      // Container cleanup will happen via timeout mechanism or explicit stop
      await sessionManager.removeSession(currentSessionId);
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    logger.error('WebSocket error', {
      error: error.message,
      sessionId: currentSessionId,
    });
  });
}
