import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { parseAuthConfig } from './config/auth.js';
import { createDatabaseClient } from './config/database.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createDashboardRouter } from './routes/dashboard.routes.js';
import { corsOptions } from './config/cors.js';
import { apiRouter } from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp({ database, authConfig = parseAuthConfig(), authRateLimits } = {}) {
  let connection;
  const getDatabase = () => database ?? (connection ??= createDatabaseClient());
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use('/api', apiRouter);
  app.use('/api/auth', createAuthRouter(getDatabase, authConfig, authRateLimits));
  for (const [path, role] of [['passenger', 'PASSENGER'], ['admin', 'ADMIN'], ['officer', 'TICKET_OFFICER']]) {
    app.use(`/api/${path}`, createDashboardRouter(getDatabase, authConfig, role));
  }
  app.use(notFound);
  app.use(errorHandler);
  app.locals.disconnectDatabase = async () => { if (connection) await connection.$disconnect(); };
  return app;
}

export default createApp();
