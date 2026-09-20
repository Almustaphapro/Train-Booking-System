import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';

export function createDashboardRouter(getDatabase, config, role) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(getDatabase, config), authorize(role));
  router.get('/dashboard', (request, response) => response.json({
    success: true, message: 'Dashboard access granted.', data: { user: request.user },
  }));
  return router;
}
