import { env } from './env.js';
import { ApiError } from '../utils/ApiError.js';

export const corsOptions = {
  origin(origin, callback) {
    // Requests without Origin include server-to-server clients and local health checks.
    if (!origin || env.clientUrls.includes(origin)) return callback(null, true);
    return callback(new ApiError(403, 'This origin is not allowed.'));
  },
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
};
