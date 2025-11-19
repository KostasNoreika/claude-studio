/**
 * Port Configuration Manager
 * P06-T001: Manages per-session port configurations for proxy
 * PERFORMANCE FIX (MEDIUM-006): Optimized with Map-based lookup and TTL cleanup
 *
 * Stores which port each session should proxy to.
 * Thread-safe in-memory storage (could be Redis in production)
 *
 * @packageDocumentation
 */

import { validatePort } from '../security/ssrf-validator';
import { timerManager } from '../utils/TimerManager';
import { logger } from '../utils/logger';

/**
 * Port configuration for a session
 */
export interface PortConfig {
  /** Session identifier */
  sessionId: string;

  /** Port number to proxy to */
  port: number;

  /** When this configuration was created */
  createdAt: Date;

  /** When this configuration was last accessed */
  lastAccessed: Date;
}

// PERFORMANCE FIX (MEDIUM-006): TTL-based cleanup interval
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Port Configuration Manager
 * Manages port mappings for each session
 */
class PortConfigManager {
  private configs: Map<string, PortConfig> = new Map();
  // PERFORMANCE FIX (MEDIUM-006): Port-to-session reverse index for O(1) lookup
  private portIndex: Map<number, Set<string>> = new Map();
  private cleanupTimerId: NodeJS.Timeout | null = null;

  constructor() {
    // Start automatic cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Configure port for a session
   *
   * Validates port number and creates a port configuration for the session.
   * SECURITY: Enforces port range and blacklist validation via SSRF validator.
   *
   * @param sessionId - Session identifier
   * @param port - Port number to proxy to (must be 3000-9999 and not blacklisted)
   * @returns Created port configuration
   * @throws {Error} If port validation fails (invalid type, range, or blacklisted)
   *
   * @example
   * ```typescript
   * const config = portConfigManager.setPortForSession('sess_123', 3001);
   * console.log(`Session ${config.sessionId} proxies to port ${config.port}`);
   * ```
   */
  setPortForSession(sessionId: string, port: number): PortConfig {
    // SECURITY: Input validation layer
    // Validate port is a valid integer
    if (!Number.isInteger(port)) {
      logger.error('[PortConfig] Validation failed: not an integer', {
        sessionId,
        port,
        type: typeof port,
      });

      throw new Error(`Invalid port: must be an integer. Received: ${port} (type: ${typeof port})`);
    }

    // Validate port is in valid port range (1-65535)
    if (port < 1 || port > 65535) {
      logger.error('[PortConfig] Validation failed: out of range', {
        sessionId,
        port,
      });

      throw new Error(`Invalid port: must be in range 1-65535. Received: ${port}`);
    }

    // SECURITY FIX (HIGH-003): Validate port using SSRF validator
    // Ensures port is in allowed range (3000-9999) and not blacklisted
    if (!validatePort(port)) {
      logger.error('[PortConfig] Validation failed: SSRF validator rejected', {
        sessionId,
        port,
      });

      throw new Error(
        `Invalid port ${port}: must be in range 3000-9999 and not blacklisted. ` +
          `Common blocked ports: 22 (SSH), 3306 (MySQL), 5432 (PostgreSQL), etc.`
      );
    }

    // Remove old port index entry if session exists
    const oldConfig = this.configs.get(sessionId);
    if (oldConfig) {
      this.removeFromPortIndex(oldConfig.port, sessionId);
    }

    const config: PortConfig = {
      sessionId,
      port,
      createdAt: new Date(),
      lastAccessed: new Date(),
    };

    this.configs.set(sessionId, config);
    // PERFORMANCE FIX (MEDIUM-006): Update port index for fast reverse lookup
    this.addToPortIndex(port, sessionId);

    logger.info('[PortConfig] Session configured', {
      sessionId,
      port,
      totalSessions: this.configs.size,
    });

    return config;
  }

  /**
   * Get port configuration for a session
   *
   * Updates the lastAccessed timestamp when retrieving configuration.
   *
   * @param sessionId - Session identifier
   * @returns Port number if session exists, null otherwise
   */
  getPortForSession(sessionId: string): number | null {
    const config = this.configs.get(sessionId);
    if (config) {
      config.lastAccessed = new Date();
      return config.port;
    }
    return null;
  }

  /**
   * Fast lookup of sessions using a specific port
   *
   * PERFORMANCE FIX (MEDIUM-006): O(1) lookup using port index instead of O(n) iteration
   *
   * @param port - Port number to look up
   * @returns Array of session IDs using this port
   */
  getSessionsUsingPort(port: number): string[] {
    const sessions = this.portIndex.get(port);
    return sessions ? Array.from(sessions) : [];
  }

  /**
   * Remove port configuration for a session
   *
   * @param sessionId - Session identifier
   * @returns true if session was removed, false if it didn't exist
   */
  removeSession(sessionId: string): boolean {
    const config = this.configs.get(sessionId);
    if (!config) {
      return false;
    }

    // Remove from port index
    this.removeFromPortIndex(config.port, sessionId);

    // Remove from configs
    const deleted = this.configs.delete(sessionId);

    if (deleted) {
      logger.info('[PortConfig] Session removed', {
        sessionId,
        totalSessions: this.configs.size,
      });
    }

    return deleted;
  }

  /**
   * Get all active port configurations
   *
   * @returns Array of all port configurations
   */
  getAllSessions(): PortConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Cleanup old sessions (not accessed for > timeout)
   *
   * Removes stale port configurations to prevent memory leaks.
   * PERFORMANCE FIX (MEDIUM-006): TTL-based automatic cleanup
   *
   * @param timeoutMs - Timeout in milliseconds (default: 30 minutes)
   * @returns Number of sessions cleaned up
   */
  cleanupOldSessions(timeoutMs: number = DEFAULT_TTL_MS): number {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, config] of this.configs.entries()) {
      const age = now.getTime() - config.lastAccessed.getTime();
      if (age > timeoutMs) {
        this.removeFromPortIndex(config.port, sessionId);
        this.configs.delete(sessionId);
        cleaned++;
        logger.debug('[PortConfig] Cleaned up stale session', {
          sessionId,
          ageMinutes: Math.round(age / 1000 / 60),
        });
      }
    }

    if (cleaned > 0) {
      logger.info('[PortConfig] Cleanup complete', {
        cleaned,
        remaining: this.configs.size,
      });
    }

    return cleaned;
  }

  /**
   * Add session to port index
   *
   * PERFORMANCE FIX (MEDIUM-006): Maintains reverse index for O(1) port lookups
   * @private
   */
  private addToPortIndex(port: number, sessionId: string): void {
    let sessions = this.portIndex.get(port);
    if (!sessions) {
      sessions = new Set();
      this.portIndex.set(port, sessions);
    }
    sessions.add(sessionId);
  }

  /**
   * Remove session from port index
   *
   * PERFORMANCE FIX (MEDIUM-006): Maintains reverse index for O(1) port lookups
   * @private
   */
  private removeFromPortIndex(port: number, sessionId: string): void {
    const sessions = this.portIndex.get(port);
    if (sessions) {
      sessions.delete(sessionId);
      // Clean up empty sets
      if (sessions.size === 0) {
        this.portIndex.delete(port);
      }
    }
  }

  /**
   * Start automatic cleanup timer
   *
   * PERFORMANCE FIX (MEDIUM-006): Periodic TTL-based cleanup
   * @private
   */
  private startCleanupTimer(): void {
    this.cleanupTimerId = timerManager.setInterval(
      () => {
        this.cleanupOldSessions();
      },
      CLEANUP_INTERVAL_MS,
      'PortConfig TTL cleanup'
    );

    logger.info('[PortConfig] Automatic cleanup started', {
      intervalMinutes: CLEANUP_INTERVAL_MS / 1000 / 60,
      ttlMinutes: DEFAULT_TTL_MS / 1000 / 60,
    });
  }

  /**
   * Stop automatic cleanup timer
   *
   * Should be called during graceful shutdown to prevent timer leaks.
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimerId) {
      timerManager.clear(this.cleanupTimerId);
      this.cleanupTimerId = null;
      logger.info('[PortConfig] Automatic cleanup stopped');
    }
  }

  /**
   * Get statistics for monitoring and debugging
   *
   * @returns Statistics object with session counts and configurations
   */
  getStats(): {
    totalSessions: number;
    uniquePorts: number;
    configs: PortConfig[];
  } {
    return {
      totalSessions: this.configs.size,
      uniquePorts: this.portIndex.size,
      configs: this.getAllSessions(),
    };
  }
}

/**
 * Singleton instance of PortConfigManager
 *
 * Use this instance for all port configuration operations.
 *
 * @example
 * ```typescript
 * import { portConfigManager } from './proxy/PortConfigManager';
 *
 * // Configure port for session
 * portConfigManager.setPortForSession('sess_123', 3001);
 *
 * // Get port for session
 * const port = portConfigManager.getPortForSession('sess_123');
 * ```
 */
export const portConfigManager = new PortConfigManager();
