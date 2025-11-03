import { Router, Request, Response } from 'express';

const router: Router = Router();

/**
 * Health check endpoint
 * GET /api/health
 * Returns: {"status":"ok","timestamp":"ISO8601"}
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
