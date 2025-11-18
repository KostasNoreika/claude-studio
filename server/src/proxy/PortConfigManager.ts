/**
 * Port Configuration Manager
 * P06-T001: Manages per-session port configurations for proxy
 *
 * Stores which port each session should proxy to.
 * Thread-safe in-memory storage (could be Redis in production)
 */

import { validatePort } from '../security/ssrf-validator';

export interface PortConfig {
  sessionId: string;
  port: number;
  createdAt: Date;
  lastAccessed: Date;
}

/**
 * Port Configuration Manager
 * Manages port mappings for each session
 */
class PortConfigManager {
  private configs: Map<string, PortConfig> = new Map();

  /**
   * Configure port for a session
   * SECURITY FIX (HIGH-003): Added port validation using SSRF validator
   *
   * @throws {Error} If port is invalid or outside allowed range
   */
  setPortForSession(sessionId: string, port: number): PortConfig {
    // SECURITY FIX (HIGH-003): Validate port using SSRF validator
    // Ensures port is in allowed range (3000-9999) and not blacklisted
    if (!validatePort(port)) {
      throw new Error(
        `Invalid port ${port}: must be in range 3000-9999 and not blacklisted. ` +
        `Common blocked ports: 22 (SSH), 3306 (MySQL), 5432 (PostgreSQL), etc.`
      );
    }

    const config: PortConfig = {
      sessionId,
      port,
      createdAt: new Date(),
      lastAccessed: new Date(),
    };

    this.configs.set(sessionId, config);
    console.log(`[PortConfig] Session ${sessionId} → Port ${port}`);
    return config;
  }

  /**
   * Get port configuration for a session
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
   * Remove port configuration for a session
   */
  removeSession(sessionId: string): boolean {
    const deleted = this.configs.delete(sessionId);
    if (deleted) {
      console.log(`[PortConfig] Removed session ${sessionId}`);
    }
    return deleted;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): PortConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Cleanup old sessions (not accessed for > timeout)
   */
  cleanupOldSessions(timeoutMs: number = 30 * 60 * 1000): number {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, config] of this.configs.entries()) {
      const age = now.getTime() - config.lastAccessed.getTime();
      if (age > timeoutMs) {
        this.configs.delete(sessionId);
        cleaned++;
        console.log(`[PortConfig] Cleaned up stale session ${sessionId}`);
      }
    }

    return cleaned;
  }
}

export const portConfigManager = new PortConfigManager();
