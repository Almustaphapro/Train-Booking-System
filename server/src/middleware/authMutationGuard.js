import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function authMutationGuard(request, _response, next) {
  const origin = request.get('Origin');
  // The custom header forces a CORS preflight for cross-origin browser requests.
  if (request.get('X-Requested-With') !== 'XMLHttpRequest' ||
      (origin && !env.clientUrls.includes(origin)) || request.get('Sec-Fetch-Site') === 'cross-site') {
    return next(new ApiError(403, 'This request is not allowed.'));
  }
  if (!request.is('application/json')) return next(new ApiError(415, 'Use an application/json request body.'));
  return next();
}
