import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import { apiRouter } from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(express.json({ limit: '16kb' }));
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);

export default app;
