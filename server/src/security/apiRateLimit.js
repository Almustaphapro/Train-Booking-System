import { rateLimit } from 'express-rate-limit';

export function createApiLimiter({ limit = 300, windowMs = 15 * 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' },
  });
}

export function createPaymentLimiter({ limit = 20, windowMs = 15 * 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message: 'Too many payment requests. Please try again later.' },
  });
}