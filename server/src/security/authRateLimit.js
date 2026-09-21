import { rateLimit } from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';

export function createAuthLimiters({ loginLimit = 10, registrationLimit = 5 } = {}) {
  const common = {
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Please try again later.' },
  };
  const loginWindow = 15 * 60 * 1000;
  const loginIp = rateLimit({ ...common, windowMs: loginWindow, limit: loginLimit, skipSuccessfulRequests: true });
  const loginAccount = rateLimit({ ...common, windowMs: loginWindow, limit: loginLimit, skipSuccessfulRequests: true,
    keyGenerator: request => String(request.body?.email ?? '').trim().toLowerCase() || ipKeyGenerator(request.ip) });
  return {
    login: [loginIp, loginAccount],
    register: rateLimit({ ...common, windowMs: 60 * 60 * 1000, limit: registrationLimit }),
  };
}
