import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';
import { activityMetrics } from '../fraud/fraud.service.js';
import { scoreActivity } from '../fraud/scoring.js';
import { authMutationGuard } from '../middleware/authMutationGuard.js';
import { dateField, dateRange, reviewBody, investigationBody, parse } from '../monitoring/monitoring.validators.js';
import { alertSelect, alertDetails, reviewAlert, investigateTicket } from '../monitoring/investigation.service.js';
import { redactText } from '../monitoring/audit.js';

const querySchema = z.strictObject({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20),
  from: dateField.optional(), to: dateField.optional(),
  type: z.enum(['DUPLICATE_TICKET_USE', 'REPEATED_INVALID_SCANS', 'EXCESSIVE_BOOKING_ATTEMPTS', 'HIGH_CANCELLATION_RATE', 'REPEATED_PAYMENT_FAILURES', 'EXCESSIVE_RESERVATIONS', 'ANOMALY_SCORE']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(), status: z.enum(['NEW', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']).optional() });

export function createFraudRouter(getDatabase, config) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(getDatabase, config), authorize('ADMIN'));
  router.get('/', async (request, response) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError(422, 'Invalid alert filters or pagination.');
    const { page, pageSize, from, to, ...filters } = parsed.data, db = getDatabase(), range = dateRange({ from, to });
    const where = { ...filters, ...(from || to ? { createdAt: range.where } : {}) };
    const [items, total] = await db.$transaction([db.fraudAlert.findMany({ where, select: alertSelect, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }), db.fraudAlert.count({ where })], { isolationLevel: 'RepeatableRead' });
    response.json({ success: true, data: { items: items.map(row => ({ ...row, description: redactText(row.description) })), total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  });
  router.get('/activity/:userId', async (request, response) => {
    const data = await getDatabase().$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: request.params.userId }, select: { id: true, role: true } });
      if (!user) throw new ApiError(404, 'This account could not be found.');
      const checkedAt = new Date();
      return { user, checkedAt, ...scoreActivity(await activityMetrics(tx, user.id, checkedAt)) };
    }, { isolationLevel: 'RepeatableRead' });
    response.json({ success: true, data });
  });
  router.get('/:id', async (request, response) => {
    response.json({ success: true, data: await alertDetails(getDatabase(), request.params.id) });
  });
  router.post('/:id/review', authMutationGuard, async (request, response) => response.json({ success: true,
    data: await reviewAlert(getDatabase(), request.params.id, request.user.id, parse(reviewBody, request.body)) }));
  router.post('/:id/investigate-ticket', authMutationGuard, async (request, response) => response.json({ success: true,
    data: await investigateTicket(getDatabase(), request.params.id, request.user.id, parse(investigationBody, request.body)) }));
  return router;
}
