import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth.js';
import { authMutationGuard } from '../middleware/authMutationGuard.js';
import { validateBody } from '../validators/auth.validators.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyForBoarding, confirmBoarding, listOfficerSchedules, officerActivity } from '../officer/officer.service.js';

const id = z.string().min(1).max(30).regex(/^[a-zA-Z0-9_-]+$/);
const verificationSchema = z.strictObject({ scheduleId: id, entry: z.string().trim().max(64).refine(value => /^[a-f0-9]{64}$/i.test(value) || /^TKT-[a-z0-9-]{4,36}$/i.test(value), 'Enter the QR token or a ticket number beginning TKT-.') });

export function createOfficerRouter(getDatabase, config) {
  const router = Router();
  router.use((_request, response, next) => { response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  router.use(authenticate(getDatabase, config), authorize('TICKET_OFFICER'));
  const limiter = rateLimit({ windowMs: 60000, limit: 120, keyGenerator: request => request.user.id, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, message: 'Too many verification requests. Please wait a minute.' } });
  router.get('/schedules', async (request, response) => {
    const query = z.strictObject({ date: z.iso.date() }).safeParse(request.query);
    if (!query.success) throw new ApiError(422, 'Choose a valid boarding date.');
    response.json({ success: true, data: await listOfficerSchedules(getDatabase(), query.data.date) });
  });
  router.get('/activity', async (request, response) => response.json({ success: true, data: await officerActivity(getDatabase(), request.user.id) }));
  router.post('/verify', authMutationGuard, limiter, validateBody(verificationSchema), async (request, response) => {
    response.json({ success: true, data: await verifyForBoarding(getDatabase(), request.user.id, request.validated, request.ip) });
  });
  router.post('/board', authMutationGuard, limiter, validateBody(z.strictObject({ verificationId: id })), async (request, response) => {
    const data = await confirmBoarding(getDatabase(), request.user.id, request.validated.verificationId, request.ip);
    response.status(data.status === 'BOARDED' ? 200 : 409).json({ success: data.status === 'BOARDED', message: data.message, data });
  });
  return router;
}
