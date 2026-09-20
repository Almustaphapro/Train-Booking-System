import { rateLimit } from 'express-rate-limit';

export function createAuthLimiters({ loginLimit = 10, registrationLimit = 5 } = {}) {
  const common = {
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Please try again later.' },
  };
  return {
    login: rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: loginLimit, skipSuccessfulRequests: true }),
    register: rateLimit({ ...common, windowMs: 60 * 60 * 1000, limit: registrationLimit }),
  };
}
