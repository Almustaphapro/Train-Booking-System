import { ApiError } from '../utils/ApiError.js';

export function errorHandler(error, _request, response, next) {
  if (response.headersSent) return next(error);

  let statusCode = 500;
  let message = 'An unexpected server error occurred.';

  if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 600) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'The request body must contain valid JSON.';
  } else if (error.type === 'entity.too.large') {
    statusCode = 413;
    message = 'The request body is too large.';
  } else if (error.status === 415) {
    statusCode = 415;
    message = 'The request body encoding is not supported.';
  }

  if (statusCode >= 500) {
    // Avoid logging request bodies, credentials or arbitrary error messages.
    // A Prisma error code helps distinguish transaction/connection failures.
    // Never print the error message, SQL arguments, request or credentials.
    const code = typeof error.code === 'string' && /^P\d{4}$/.test(error.code) ? ` (${error.code})` : '';
    console.error(`An unexpected API error occurred${code}.`);
  }

  return response.status(statusCode).json({ success: false, message,
    ...(error instanceof ApiError && error.fields ? { fields: error.fields } : {}),
  });
}
