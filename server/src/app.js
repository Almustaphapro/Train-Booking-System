import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { parseAuthConfig } from './config/auth.js';
import { createDatabaseClient } from './config/database.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createPublicRouter } from './routes/public.routes.js';
import { createBookingRouter } from './routes/booking.routes.js';
import { startHoldCleanup } from './services/hold-cleanup.js';
import { parsePaymentConfig } from './config/payments.js';
import { createPaymentRouter } from './routes/payment.routes.js';
import { startPaymentWorker } from './payments/payment.worker.js';
import { createTicketRouter } from './routes/ticket.routes.js';
import { createOfficerRouter } from './routes/officer.routes.js';
import { createFraudRouter } from './routes/fraud.routes.js';
import { createMonitoringRouter } from './routes/monitoring.routes.js';
import { createDashboardRouter } from './routes/dashboard.routes.js';
import { corsOptions } from './config/cors.js';
import { apiRouter } from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createApiLimiter } from './security/apiRateLimit.js';

export function createApp({ database, authConfig = parseAuthConfig(), authRateLimits, paymentConfig = parsePaymentConfig() } = {}) {
  let connection;
  const getDatabase = () => database ?? (connection ??= createDatabaseClient());
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use('/api', createApiLimiter());
  app.use('/api', apiRouter);
  app.use('/api', createPublicRouter(getDatabase));
  app.use('/api/auth', createAuthRouter(getDatabase, authConfig, authRateLimits));
  app.use('/api/bookings', createBookingRouter(getDatabase, authConfig));
  app.use('/api', createPaymentRouter(getDatabase, authConfig, paymentConfig));
  app.use('/api/tickets', createTicketRouter(getDatabase, authConfig));
  app.use('/api/officer', createOfficerRouter(getDatabase, authConfig));
  app.use('/api/admin/fraud-alerts', createFraudRouter(getDatabase, authConfig));
  app.use('/api/admin', createMonitoringRouter(getDatabase, authConfig));
  app.use('/api/admin', createAdminRouter(getDatabase, authConfig));
  for (const [path, role] of [['passenger', 'PASSENGER'], ['admin', 'ADMIN'], ['officer', 'TICKET_OFFICER']]) {
    app.use(`/api/${path}`, createDashboardRouter(getDatabase, authConfig, role));
  }
  app.use(notFound);
  app.use(errorHandler);
  let stopCleanup, stopPayments;
  app.locals.startHoldCleanup = () => { stopCleanup ??= startHoldCleanup(getDatabase); };
  app.locals.startPaymentWorker = () => { stopPayments ??= startPaymentWorker(getDatabase, paymentConfig); };
  app.locals.disconnectDatabase = async () => { if (stopCleanup) await stopCleanup(); if (stopPayments) await stopPayments(); if (connection) await connection.$disconnect(); };
  return app;
}

export default createApp();
