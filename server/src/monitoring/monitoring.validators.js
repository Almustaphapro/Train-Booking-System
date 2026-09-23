import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { railwayDate, travelDayBounds } from '../services/search.service.js';

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= '2100-12-31';
}, 'Choose a real calendar date.');
export const pagination = { page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) };
export const reportQuery = z.strictObject({ from: dateField.optional(), to: dateField.optional() });
export const auditQuery = z.strictObject({ ...pagination, from: dateField.optional(), to: dateField.optional(),
  action: z.string().trim().regex(/^[A-Z_]+$/).max(100).optional(), entityType: z.string().trim().max(50).optional(), entityId: z.string().trim().max(64).optional(),
  actorId: z.string().trim().max(30).optional(), actorRole: z.enum(['ADMIN', 'PASSENGER', 'TICKET_OFFICER']).optional() });
export const noteField = z.string().trim().min(10).max(1000);
export const reviewBody = z.strictObject({ status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']), note: noteField, expectedUpdatedAt: z.iso.datetime() });
export const investigationBody = z.strictObject({ note: noteField });
export const activityQuery = resource => z.strictObject({ ...pagination, q: z.string().trim().max(100).optional(), from: dateField.optional(), to: dateField.optional(),
  status: z.enum(resource === 'bookings' ? ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED'] : ['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional() });
export const passengerStatusBody = z.strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED']), expectedStatus: z.enum(['ACTIVE', 'SUSPENDED']), note: noteField });

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(422, 'Check the supplied fields, dates and filters. Review notes need 10–1000 characters.');
  return result.data;
}
export function dateRange({ from, to }, { defaults = false, now = new Date() } = {}) {
  if (defaults) {
    to ??= railwayDate(now);
    from ??= railwayDate(new Date(travelDayBounds(to).start.getTime() - 29 * 86400000));
  }
  if (from && to && from > to) throw new ApiError(422, 'The start date must not be after the end date.');
  const start = from ? travelDayBounds(from).start : undefined, end = to ? travelDayBounds(to).end : undefined;
  if (start && end && (end - start) / 86400000 > 93) throw new ApiError(422, 'Choose a reporting range of at most 93 days.');
  return { from, to, start, end, where: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } };
}
