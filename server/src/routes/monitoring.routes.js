import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { authMutationGuard } from '../middleware/authMutationGuard.js';
import { parse, reportQuery, auditQuery, passengerStatusBody } from '../monitoring/monitoring.validators.js';
import { monitoringReport, listAuditLogs } from '../monitoring/reporting.service.js';
import { changePassengerStatus } from '../monitoring/investigation.service.js';

export function createMonitoringRouter(getDatabase, config) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(getDatabase, config), authorize('ADMIN'));
  router.get('/monitoring', async (request, response) => response.json({ success: true, data: await monitoringReport(getDatabase(), parse(reportQuery, request.query)) }));
  router.get('/audit-logs', async (request, response) => response.json({ success: true, data: await listAuditLogs(getDatabase(), parse(auditQuery, request.query)) }));
  router.post('/passengers/:id/status', authMutationGuard, async (request, response) => response.json({ success: true,
    data: await changePassengerStatus(getDatabase(), request.params.id, request.user.id, parse(passengerStatusBody, request.body)) }));
  return router;
}
