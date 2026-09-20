import { z } from 'zod';

const text = max => z.string().trim().min(1, 'This field is required.').max(max)
  .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), 'Control characters are not allowed.');
const code = max => text(max).toUpperCase().regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and hyphens.');
const id = text(30);
const integer = max => z.number().int().min(1).max(max);
const decimal = (digits, positive = false) => z.string().regex(new RegExp(`^\\d{1,${digits}}(\\.\\d{1,2})?$`), 'Use a nonnegative amount with at most two decimal places.')
  .refine(value => !positive || Number(value) > 0, 'Must be greater than zero.');
export const statuses = {
  stations: ['ACTIVE', 'INACTIVE'], routes: ['ACTIVE', 'INACTIVE'],
  trains: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'], seats: ['ACTIVE', 'OUT_OF_SERVICE'],
  schedules: ['SCHEDULED', 'BOARDING', 'DEPARTED', 'COMPLETED', 'CANCELLED'],
};
export const adminSchemas = {
  stations: z.strictObject({ name: text(150), code: code(20), city: text(100), state: text(100), status: z.enum(statuses.stations) }),
  routes: z.strictObject({ originStationId: id, destinationStationId: id, distanceKm: decimal(6, true), estimatedDuration: integer(10080), status: z.enum(statuses.routes) })
    .refine(data => data.originStationId !== data.destinationStationId, { path: ['destinationStationId'], message: 'Origin and destination must be different.' }),
  trains: z.strictObject({ name: text(150), code: code(30), capacity: integer(1000), status: z.enum(statuses.trains) }),
  seats: z.strictObject({ trainId: id, seatNumber: code(10), seatClass: z.enum(['ECONOMY', 'BUSINESS']), status: z.enum(statuses.seats) }),
  schedules: z.strictObject({ trainId: id, routeId: id, departureTime: z.iso.datetime({ offset: true }), arrivalTime: z.iso.datetime({ offset: true }), fareEconomy: decimal(10), fareBusiness: decimal(10), status: z.enum(statuses.schedules) })
    .refine(data => new Date(data.arrivalTime) > new Date(data.departureTime), { path: ['arrivalTime'], message: 'Arrival must be after departure.' }),
};
export function listSchema(resource) {
  return z.strictObject({ q: z.string().trim().max(100).optional(), status: z.enum(statuses[resource]).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(15),
    ...(resource === 'seats' || resource === 'schedules' ? { trainId: id.optional() } : {}),
    ...(resource === 'seats' ? { seatClass: z.enum(['ECONOMY', 'BUSINESS']).optional() } : {}),
  });
}
