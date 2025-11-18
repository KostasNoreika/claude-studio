/**
 * Proxy API Routes
 * P06-T001: Port configuration endpoint
 *
 * Handles:
 * - POST /api/proxy/configure - Configure port for session
 */

import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { portConfigManager } from '../../proxy/PortConfigManager';
import { validateProxyTargetWithPort } from '../../security/ssrf-validator';
import { errorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';

const router: IRouter = Router();

/**
 * POST /api/proxy/configure
 *
 * Configure which port a session should proxy to
 *
 * Body: { sessionId: string, port: number }
 * Returns: { success: true, sessionId: string, port: number, proxyUrl: string }
 */
router.post('/configure', async (req: Request, res: Response) => {
  try {
    const { sessionId, port } = req.body;

    // Validate input
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Invalid or missing sessionId',
      });
      return;
    }

    if (!port || typeof port !== 'number') {
      res.status(400).json({
        success: false,
        error: 'Invalid or missing port number',
      });
      return;
    }

    // SSRF validation (CRITICAL)
    const validation = validateProxyTargetWithPort('127.0.0.1', port);
    if (!validation.allowed) {
      logger.warn('SSRF attempt blocked', {
        sessionId,
        port,
        reason: validation.reason
      });
      res.status(403).json({
        success: false,
        error: validation.reason,
      });
      return;
    }

    // Store port configuration
    const config = portConfigManager.setPortForSession(sessionId, port);

    // Generate proxy URL
    const proxyUrl = `/preview/${sessionId}`;

    res.json({
      success: true,
      sessionId: config.sessionId,
      port: config.port,
      proxyUrl,
    });

    logger.info('Proxy port configured', { sessionId, port });
  } catch (error) {
    errorResponse(res, 'Internal server error', { context: { error } });
  }
});

/**
 * GET /api/proxy/status/:sessionId
 *
 * Get current port configuration for a session
 */
router.get('/status/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const port = portConfigManager.getPortForSession(sessionId);

  if (port === null) {
    res.status(404).json({
      success: false,
      error: 'Session not found or not configured',
    });
    return;
  }

  res.json({
    success: true,
    sessionId,
    port,
    proxyUrl: `/preview/${sessionId}`,
  });
});

/**
 * DELETE /api/proxy/configure/:sessionId
 *
 * Remove port configuration for a session
 */
router.delete('/configure/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const removed = portConfigManager.removeSession(sessionId);

  if (!removed) {
    res.status(404).json({
      success: false,
      error: 'Session not found',
    });
    return;
  }

  res.json({
    success: true,
    message: 'Port configuration removed',
  });
});

export const proxyRouter = router;
