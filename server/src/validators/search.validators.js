import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { PREFERENCES } from '../recommendation/scoring.js';

export const searchSchema = z.strictObject({
  originId: z.string().trim().min(1, 'Select an origin station.').max(30),
  destinationId: z.string().trim().min(1, 'Select a destination station.').max(30),
  date: z.iso.date('Enter a valid travel date (YYYY-MM-DD).'),
  preference: z.enum(Object.keys(PREFERENCES)).default('BEST_OVERALL'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
}).refine(value => value.originId !== value.destinationId, { path: ['destinationId'], message: 'Origin and destination must be different.' });

export function validateSearch(request, _response, next) {
  const parsed = searchSchema.safeParse(request.query);
  if (!parsed.success) {
    const error = new ApiError(422, 'Please check your journey details.'); error.fields = {};
    for (const issue of parsed.error.issues) error.fields[issue.path[0] ?? '_form'] ??= issue.code === 'unrecognized_keys' ? 'Unexpected search parameters.' : issue.message;
    return next(error);
  }
  request.validated = parsed.data; return next();
}
