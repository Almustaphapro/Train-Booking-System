import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { authMutationGuard } from '../middleware/authMutationGuard.js';
import { validateBody } from '../validators/auth.validators.js';
import { paymentSchema } from '../validators/payment.validators.js';
import { initializePayment, listBookingPayments, getPayment } from '../payments/payment.service.js';
import { createPaymentLimiter } from '../security/apiRateLimit.js';

export function createPaymentRouter(getDatabase, authConfig, paymentConfig, rateLimits) {
  const router = Router();
  // Do not apply passenger authorization to unrelated /api paths.
  const guard = [authenticate(getDatabase, authConfig), authorize('PASSENGER')];
  router.use(['/payments', '/bookings/:id/payments'], (_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.post('/bookings/:id/payments', ...guard, authMutationGuard, createPaymentLimiter(rateLimits), validateBody(paymentSchema), async (request, response) => {
    const data = await initializePayment(getDatabase(), request.user.id, request.params.id, request.validated, paymentConfig);
    response.status(data.replayed ? 200 : 201).json({ success: true, message: 'Demo payment request recorded. No real money will be charged.', data: { ...data, environment: 'DEMO PAYMENT ENVIRONMENT' } });
  });
  router.get('/bookings/:id/payments', ...guard, async (request, response) => response.json({ success: true, data: await listBookingPayments(getDatabase(), request.user.id, request.params.id, paymentConfig) }));
  router.get('/payments/:id', ...guard, async (request, response) => response.json({ success: true, data: await getPayment(getDatabase(), request.user.id, request.params.id, paymentConfig) }));
  return router;
}
