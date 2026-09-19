import { ApiError } from '../utils/ApiError.js';

export function notFound(_request, _response, next) {
  next(new ApiError(404, 'The requested endpoint was not found.'));
}
