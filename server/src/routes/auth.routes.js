import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authMutationGuard } from '../middleware/authMutationGuard.js';
import { createAuthLimiters } from '../security/authRateLimit.js';
import { loginSchema, registrationSchema, validateBody } from '../validators/auth.validators.js';

export function createAuthRouter(getDatabase, config, rateLimits) {
  const router = Router();
  const controller = createAuthController(getDatabase, config);
  const limiters = createAuthLimiters(rateLimits);
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.post('/register', authMutationGuard, limiters.register, validateBody(registrationSchema), controller.register);
  router.post('/login', authMutationGuard, limiters.login, validateBody(loginSchema), controller.login);
  router.post('/logout', authMutationGuard, controller.logout);
  router.get('/me', authenticate(getDatabase, config), controller.me);
  return router;
}
