/**
 * Session Cleanup & Heartbeat
 * P09-T006: Auto-cleanup expired sessions
 *
 * Features:
 * - Session timeout (30 min idle)
 * - Heartbeat mechanism
 * - Automatic container cleanup
 */

import { containerManager } from './ContainerManager';
import { logger } from '../utils/logger';

// Session timeout: 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Cleanup interval: check every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Track last activity per session
const sessionActivity = new Map<string, number>();

// Track heartbeat intervals
const heartbeatIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Register session activity (heartbeat)
 * Called on any WebSocket message or API request
 */
export function recordActivity(sessionId: string): void {
  sessionActivity.set(sessionId, Date.now());
}

/**
 * Start heartbeat for a session
 * Automatically sends heartbeat pings from server to client
 */
export function startHeartbeat(
  sessionId: string,
  sendPing: () => void
): void {
  // Clear existing heartbeat if any
  stopHeartbeat(sessionId);

  // Record initial activity
  recordActivity(sessionId);

  // Send ping every 30 seconds
  const interval = setInterval(() => {
    try {
      sendPing();
    } catch (error) {
      logger.error('Failed to send heartbeat', { sessionId, error });
      stopHeartbeat(sessionId);
    }
  }, 30 * 1000);

  heartbeatIntervals.set(sessionId, interval);
}

/**
 * Stop heartbeat for a session
 */
export function stopHeartbeat(sessionId: string): void {
  const interval = heartbeatIntervals.get(sessionId);
  if (interval) {
    clearInterval(interval);
    heartbeatIntervals.delete(sessionId);
  }
}

/**
 * Check if session is expired
 */
export function isSessionExpired(sessionId: string): boolean {
  const lastActivity = sessionActivity.get(sessionId);
  if (!lastActivity) {
    return true; // No activity recorded = expired
  }

  const timeSinceActivity = Date.now() - lastActivity;
  return timeSinceActivity > SESSION_TIMEOUT_MS;
}

/**
 * Get session age in milliseconds
 */
export function getSessionAge(sessionId: string): number | null {
  const lastActivity = sessionActivity.get(sessionId);
  if (!lastActivity) {
    return null;
  }

  return Date.now() - lastActivity;
}

/**
 * Cleanup expired sessions
 * Removes containers and clears tracking data
 */
export async function cleanupExpiredSessions(): Promise<number> {
  let cleanedCount = 0;

  // Get all tracked sessions
  for (const [sessionId, lastActivity] of sessionActivity.entries()) {
    const timeSinceActivity = Date.now() - lastActivity;

    if (timeSinceActivity > SESSION_TIMEOUT_MS) {
      const idleMinutes = Math.round(timeSinceActivity / 1000 / 60);
      logger.info('Cleaning up expired session', { sessionId, idleMinutes });

      try {
        // Stop heartbeat
        stopHeartbeat(sessionId);

        // Stop container session if exists
        const session = containerManager.getSession(sessionId);
        if (session) {
          await containerManager.stopSession(sessionId);
          cleanedCount++;
        }

        // Remove from tracking
        sessionActivity.delete(sessionId);
      } catch (error) {
        logger.error('Failed to cleanup session', { sessionId, error });
      }
    }
  }

  return cleanedCount;
}

/**
 * Start automatic cleanup interval
 * Should be called once on server startup
 */
export function startSessionCleanup(): NodeJS.Timeout {
  logger.info('Starting session cleanup', {
    timeout: '30min',
    checkInterval: '5min'
  });

  const interval = setInterval(async () => {
    try {
      const cleaned = await cleanupExpiredSessions();
      if (cleaned > 0) {
        logger.info('Session cleanup completed', { removedSessions: cleaned });
      }
    } catch (error) {
      logger.error('Session cleanup error', { error });
    }
  }, CLEANUP_INTERVAL_MS);

  // Run initial cleanup on startup
  cleanupExpiredSessions().catch(error => {
    logger.error('Initial session cleanup failed', { error });
  });

  return interval;
}

/**
 * Stop automatic cleanup
 * Called on server shutdown
 */
export function stopSessionCleanup(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  logger.info('Session cleanup stopped');
}

/**
 * Remove session from tracking
 * Called when session is explicitly closed
 */
export function removeSession(sessionId: string): void {
  stopHeartbeat(sessionId);
  sessionActivity.delete(sessionId);
}

/**
 * Get statistics about active sessions
 */
export function getSessionStats(): {
  total: number;
  active: number;
  expired: number;
  sessions: Array<{
    sessionId: string;
    lastActivity: number;
    age: number;
    expired: boolean;
  }>;
} {
  const sessions = Array.from(sessionActivity.entries()).map(
    ([sessionId, lastActivity]) => {
      const age = Date.now() - lastActivity;
      return {
        sessionId,
        lastActivity,
        age,
        expired: age > SESSION_TIMEOUT_MS,
      };
    }
  );

  return {
    total: sessions.length,
    active: sessions.filter(s => !s.expired).length,
    expired: sessions.filter(s => s.expired).length,
    sessions,
  };
}
