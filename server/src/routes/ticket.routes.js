import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { authMutationGuard } from '../middleware/authMutationGuard.js';
import { validateBody } from '../validators/auth.validators.js';
import { bookingListSchema } from '../validators/booking.validators.js';
import { ApiError } from '../utils/ApiError.js';
import { getMyTicket, listMyTickets, verifyTicketToken } from '../tickets/ticket.service.js';
import { ticketPdf } from '../tickets/ticket.pdf.js';

export function createTicketRouter(getDatabase, config) {
  const router = Router();
  router.use((_request, response, next) => { response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  router.use(authenticate(getDatabase, config));
  // Read-only token lookup retained for compatibility; boarding uses /officer.
  router.post('/verify', authorize('ADMIN', 'TICKET_OFFICER'), authMutationGuard,
    rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { success: false, message: 'Too many verification requests. Please wait a minute.' } }),
    validateBody(z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Enter a valid ticket token.') })),
    async (request, response) => response.json({ success: true, data: await verifyTicketToken(getDatabase(), request.validated.token) }));
  router.use(authorize('PASSENGER'));
  router.get('/', async (request, response) => {
    const parsed = bookingListSchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError(422, 'Invalid ticket pagination parameters.');
    response.json({ success: true, data: await listMyTickets(getDatabase(), request.user.id, parsed.data) });
  });
  router.get('/:id/download', async (request, response) => {
    const data = await getMyTicket(getDatabase(), request.user.id, request.params.id);
    const pdf = await ticketPdf(data);
    response.attachment(`RailConnect-${data.ticket.ticketNumber.replace(/[^A-Za-z0-9-]/g, '')}.pdf`).type('application/pdf').send(pdf);
  });
  router.get('/:id', async (request, response) => response.json({ success: true, data: await getMyTicket(getDatabase(), request.user.id, request.params.id) }));
  return router;
}
