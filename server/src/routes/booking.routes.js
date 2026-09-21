import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { authMutationGuard } from '../middleware/authMutationGuard.js';
import { validateBody } from '../validators/auth.validators.js';
import { reservationSchema, bookingListSchema } from '../validators/booking.validators.js';
import { createPendingBooking, getMyBooking, listMyBookings, cancelPendingBooking } from '../services/booking.service.js';
import { ApiError } from '../utils/ApiError.js';
import { recordBookingAttempt } from '../fraud/fraud.service.js';

export function createBookingRouter(getDatabase, config) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(getDatabase, config), authorize('PASSENGER'));
  router.post('/', authMutationGuard, async (request, _response, next) => { await recordBookingAttempt(getDatabase(), request.user.id); next(); }, validateBody(reservationSchema), async (request, response) => {
    response.status(201).json({ success: true, message: 'Your seat is temporarily held. This is a pending booking, not a paid ticket.', data: await createPendingBooking(getDatabase(), request.user.id, request.validated) });
  });
  router.get('/', async (request, response) => {
    const parsed = bookingListSchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError(422, 'Invalid booking pagination parameters.');
    response.json({ success: true, data: await listMyBookings(getDatabase(), request.user.id, parsed.data) });
  });
  router.get('/:id', async (request, response) => response.json({ success: true, data: await getMyBooking(getDatabase(), request.user.id, request.params.id) }));
  router.post('/:id/cancel', authMutationGuard, async (request, response) => response.json({ success: true, message: 'Reservation cancelled.', data: await cancelPendingBooking(getDatabase(), request.user.id, request.params.id) }));
  return router;
}
