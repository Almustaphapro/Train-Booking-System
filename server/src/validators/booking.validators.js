import { z } from 'zod';

const id = z.string().trim().min(1).max(30).regex(/^[a-zA-Z0-9_-]+$/);
export const reservationSchema = z.strictObject({
  scheduleId: id, seatId: id,
  expectedAmount: z.string().regex(/^\d{1,10}\.\d{2}$/, 'Refresh the booking review to confirm the fare.'),
});
export const bookingListSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
