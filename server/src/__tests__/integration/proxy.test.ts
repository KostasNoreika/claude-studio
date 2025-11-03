/**
 * Proxy Integration Tests
 * P06-T009: Integration tests for proxy functionality
 *
 * Tests the complete proxy flow:
 * - Port configuration API
 * - SSRF prevention in API
 * - Port config manager
 */

import request from 'supertest';
import app from '../../app';
import { portConfigManager } from '../../proxy/PortConfigManager';

describe('Proxy API', () => {
  beforeEach(() => {
    // Clear port configurations before each test
    portConfigManager.getAllSessions().forEach((session) => {
      portConfigManager.removeSession(session.sessionId);
    });
  });

  describe('POST /api/proxy/configure', () => {
    it('should configure valid port for session', async () => {
      const response = await request(app)
        .post('/api/proxy/configure')
        .send({
          sessionId: 'sess_test_123',
          port: 5173,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        sessionId: 'sess_test_123',
        port: 5173,
        proxyUrl: '/preview/sess_test_123',
      });

      // Verify port was stored
      const storedPort = portConfigManager.getPortForSession('sess_test_123');
      expect(storedPort).toBe(5173);
    });

    it('should reject missing sessionId', async () => {
      const response = await request(app)
        .post('/api/proxy/configure')
        .send({
          port: 5173,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('sessionId');
    });

    it('should reject missing port', async () => {
      const response = await request(app)
        .post('/api/proxy/configure')
        .send({
          sessionId: 'sess_test_123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('port');
    });

    it('should reject invalid port (below range)', async () => {
      const response = await request(app)
        .post('/api/proxy/configure')
        .send({
          sessionId: 'sess_test_123',
          port: 80,
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Port');
    });

    it('should reject invalid port (above range)', async () => {
      const response = await request(app)
        .post('/api/proxy/configure')
        .send({
          sessionId: 'sess_test_123',
          port: 10000,
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should handle multiple sessions', async () => {
      await request(app)
        .post('/api/proxy/configure')
        .send({ sessionId: 'sess_1', port: 5173 })
        .expect(200);

      await request(app)
        .post('/api/proxy/configure')
        .send({ sessionId: 'sess_2', port: 3000 })
        .expect(200);

      expect(portConfigManager.getPortForSession('sess_1')).toBe(5173);
      expect(portConfigManager.getPortForSession('sess_2')).toBe(3000);
    });

    it('should update port for existing session', async () => {
      await request(app)
        .post('/api/proxy/configure')
        .send({ sessionId: 'sess_1', port: 5173 })
        .expect(200);

      const response = await request(app)
        .post('/api/proxy/configure')
        .send({ sessionId: 'sess_1', port: 8080 })
        .expect(200);

      expect(response.body.port).toBe(8080);
      expect(portConfigManager.getPortForSession('sess_1')).toBe(8080);
    });
  });

  describe('GET /api/proxy/status/:sessionId', () => {
    it('should return status for configured session', async () => {
      portConfigManager.setPortForSession('sess_test', 5173);

      const response = await request(app)
        .get('/api/proxy/status/sess_test')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        sessionId: 'sess_test',
        port: 5173,
        proxyUrl: '/preview/sess_test',
      });
    });

    it('should return 404 for unconfigured session', async () => {
      const response = await request(app)
        .get('/api/proxy/status/sess_unknown')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('DELETE /api/proxy/configure/:sessionId', () => {
    it('should remove configured session', async () => {
      portConfigManager.setPortForSession('sess_test', 5173);

      await request(app)
        .delete('/api/proxy/configure/sess_test')
        .expect(200);

      expect(portConfigManager.getPortForSession('sess_test')).toBeNull();
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .delete('/api/proxy/configure/sess_unknown')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});

describe('PortConfigManager', () => {
  beforeEach(() => {
    portConfigManager.getAllSessions().forEach((session) => {
      portConfigManager.removeSession(session.sessionId);
    });
  });

  it('should store and retrieve port configuration', () => {
    const config = portConfigManager.setPortForSession('sess_1', 5173);

    expect(config.sessionId).toBe('sess_1');
    expect(config.port).toBe(5173);
    expect(config.createdAt).toBeInstanceOf(Date);

    const port = portConfigManager.getPortForSession('sess_1');
    expect(port).toBe(5173);
  });

  it('should return null for non-existent session', () => {
    const port = portConfigManager.getPortForSession('sess_unknown');
    expect(port).toBeNull();
  });

  it('should update lastAccessed on get', () => {
    portConfigManager.setPortForSession('sess_1', 5173);

    const sessions1 = portConfigManager.getAllSessions();
    const lastAccessed1 = sessions1[0].lastAccessed;

    // Wait a bit
    const start = Date.now();
    while (Date.now() - start < 10) {
      // Small delay
    }

    portConfigManager.getPortForSession('sess_1');

    const sessions2 = portConfigManager.getAllSessions();
    const lastAccessed2 = sessions2[0].lastAccessed;

    expect(lastAccessed2.getTime()).toBeGreaterThan(lastAccessed1.getTime());
  });

  it('should remove session', () => {
    portConfigManager.setPortForSession('sess_1', 5173);
    expect(portConfigManager.getPortForSession('sess_1')).toBe(5173);

    const removed = portConfigManager.removeSession('sess_1');
    expect(removed).toBe(true);
    expect(portConfigManager.getPortForSession('sess_1')).toBeNull();
  });

  it('should cleanup old sessions', () => {
    const config = portConfigManager.setPortForSession('sess_old', 5173);

    // Manually set old lastAccessed time (40 minutes ago)
    config.lastAccessed = new Date(Date.now() - 40 * 60 * 1000);

    portConfigManager.setPortForSession('sess_new', 3000);

    // Cleanup sessions older than 30 minutes
    const cleaned = portConfigManager.cleanupOldSessions(30 * 60 * 1000);

    expect(cleaned).toBe(1);
    expect(portConfigManager.getPortForSession('sess_old')).toBeNull();
    expect(portConfigManager.getPortForSession('sess_new')).toBe(3000);
  });
});
