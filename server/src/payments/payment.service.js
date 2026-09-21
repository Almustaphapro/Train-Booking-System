import { randomBytes } from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { getMyBooking, releaseExpiredHolds } from '../services/booking.service.js';
import { demoProvider } from './providers/demo.provider.js';

const conflict = message => new ApiError(409, message);
const reference = prefix => `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(10).toString('hex').toUpperCase()}`;
const paymentDto = row => ({ id: row.id, bookingId: row.bookingId, transactionReference: row.transactionReference,
  amount: row.amount.toFixed(2), currency: row.currency, paymentMethod: row.paymentMethod, status: row.status, isDemo: row.isDemo,
  provider: row.provider, failureReason: row.failureReason, createdAt: row.createdAt, paidAt: row.paidAt });
export async function paymentTransaction(db, work) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000 }); }
    catch (error) {
      if (['P2034', 'P2002'].includes(error.code) && attempt < 3) continue;
      if (['P2034', 'P2002'].includes(error.code)) throw conflict('Another payment operation is in progress. Refresh this booking before retrying.');
      throw error;
    }
  }
}
const includeBooking = { scheduleSeat: { include: { seat: true } }, schedule: { include: { train: true, route: { include: { originStation: true, destinationStation: true } } } } };
function payable(booking, now) {
  return booking.bookingStatus === 'PENDING' && ['PENDING', 'FAILED'].includes(booking.paymentStatus) &&
    booking.activeScheduleSeatId === booking.scheduleSeatId && booking.expiresAt > now &&
    booking.scheduleSeat.status === 'HELD' && booking.scheduleSeat.heldUntil > now && booking.scheduleSeat.seat.status === 'ACTIVE' &&
    booking.schedule.status === 'SCHEDULED' && booking.schedule.departureTime > now &&
    [booking.schedule.train, booking.schedule.route, booking.schedule.route.originStation, booking.schedule.route.destinationStation].every(row => row.status === 'ACTIVE');
}
export async function initializePayment(db, userId, bookingId, input, config) {
  if (!config.enabled) throw new ApiError(503, 'The demo payment environment is currently disabled.');
  await getMyBooking(db, userId, bookingId); // Ownership and expired-hold cleanup.
  return paymentTransaction(db, async tx => {
    const booking = await tx.booking.findFirst({ where: { id: bookingId, userId }, include: includeBooking });
    if (!booking) throw new ApiError(404, 'This booking could not be found.');
    const replay = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (replay) {
      if (replay.bookingId !== bookingId || replay.paymentMethod !== input.paymentMethod) throw conflict('This payment request key has already been used. Refresh your payment details.');
      return { payment: paymentDto(replay), replayed: true };
    }
    const now = new Date();
    if (!payable(booking, now)) throw conflict('This booking is not payable. Its hold may have expired, or it may already be confirmed or cancelled.');
    if (await tx.payment.count({ where: { bookingId, status: 'PENDING' } })) throw conflict('A payment is already pending for this booking. Check its result before trying again.');
    const previousAttempts = await tx.payment.count({ where: { bookingId, provider: 'DEMO' } });
    const intent = demoProvider.createIntent({ scenario: config.scenario, previousAttempts, now });
    const payment = await tx.payment.create({ data: { bookingId, transactionReference: reference('DMP'), amount: booking.amount, currency: booking.currency,
      paymentMethod: input.paymentMethod, isDemo: true, provider: 'DEMO', idempotencyKey: input.idempotencyKey, ...intent } });
    await tx.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'PENDING' } });
    await tx.auditLog.create({ data: { userId, action: 'DEMO_PAYMENT_PENDING', entityType: 'Payment', entityId: payment.id } });
    return { payment: paymentDto(payment), replayed: false };
  });
}

// Provider verification happens outside the retryable database transaction.
// Future adapters must authenticate provider responses here; never accept a
// browser-supplied result or run a money-moving network request in a DB retry.
export async function settlePayment(db, id, provider = demoProvider) {
  const intent = await db.payment.findUnique({ where: { id } });
  if (!intent || intent.status !== 'PENDING' || intent.provider !== provider.name) return;
  const verified = await provider.verify(intent);
  if (!['PENDING', 'PAID', 'FAILED'].includes(verified.status) || verified.transactionReference !== intent.transactionReference || verified.amount !== intent.amount.toFixed(2) || verified.currency !== intent.currency) throw new ApiError(502, 'The provider result could not be verified. Please check again.');
  if (verified.status === 'PENDING') return;
  await paymentTransaction(db, async tx => {
    const payment = await tx.payment.findUnique({ where: { id }, include: { booking: { include: includeBooking } } });
    if (!payment || payment.status !== 'PENDING') return;
    if (payment.transactionReference !== verified.transactionReference || payment.amount.toFixed(2) !== verified.amount || payment.currency !== verified.currency) throw new ApiError(502, 'The provider result could not be verified.');
    const booking = payment.booking, now = new Date();
    if (payment.amount.toFixed(2) !== booking.amount.toFixed(2) || payment.currency !== booking.currency) throw new ApiError(502, 'The payment amount could not be verified.');
    if (!payable(booking, now)) {
      await tx.payment.update({ where: { id }, data: { status: 'FAILED', failureReason: 'The reservation is no longer payable. No money was charged.' } });
      if (booking.bookingStatus === 'PENDING' && booking.paymentStatus !== 'PAID') {
        await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'FAILED' } });
      }
      await tx.auditLog.create({ data: { action: 'DEMO_PAYMENT_FAILED', entityType: 'Payment', entityId: id } });
      return;
    }
    if (verified.status === 'FAILED') {
      await tx.payment.update({ where: { id }, data: { status: 'FAILED', failureReason: 'The demo provider declined this simulated payment. No money was charged.' } });
      await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'FAILED' } });
      await tx.auditLog.create({ data: { userId: booking.userId, action: 'DEMO_PAYMENT_FAILED', entityType: 'Payment', entityId: id } });
      return;
    }
    await tx.payment.update({ where: { id }, data: { status: 'PAID', paidAt: now, failureReason: null } });
    await tx.booking.update({ where: { id: booking.id }, data: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } });
    await tx.scheduleSeat.update({ where: { id: booking.scheduleSeatId }, data: { status: 'BOOKED', heldUntil: null } });
    const ticket = await tx.ticket.create({ data: { bookingId: booking.id, ticketNumber: reference('TKT'), qrToken: randomBytes(32).toString('hex'),
      status: 'VALID', issuedAt: now, expiresAt: booking.schedule.arrivalTime } });
    await tx.auditLog.createMany({ data: [
      { userId: booking.userId, action: 'DEMO_PAYMENT_PAID', entityType: 'Payment', entityId: id },
      { userId: booking.userId, action: 'DEMO_TICKET_CREATED', entityType: 'Ticket', entityId: ticket.id },
    ] });
  });
  // If expiry won the race, clear its now-failed unpaid claim immediately.
  await releaseExpiredHolds(db, { activeBooking: { is: { id: intent.bookingId } } });
}
export async function getPayment(db, userId, id, config) {
  const own = await db.payment.findFirst({ where: { id, booking: { userId } }, select: { bookingId: true } });
  if (!own) throw new ApiError(404, 'This payment could not be found.');
  await getMyBooking(db, userId, own.bookingId);
  if (config.enabled) await settlePayment(db, id);
  const payment = await db.payment.findFirst({ where: { id, booking: { userId } } });
  return { payment: paymentDto(payment), environment: 'DEMO PAYMENT ENVIRONMENT' };
}
export async function listBookingPayments(db, userId, bookingId, config) {
  await getMyBooking(db, userId, bookingId);
  if (config.enabled) {
    const pending = await db.payment.findMany({ where: { bookingId, status: 'PENDING', provider: 'DEMO' }, select: { id: true } });
    for (const row of pending) await settlePayment(db, row.id);
  }
  const rows = await db.payment.findMany({ where: { bookingId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  return { items: rows.map(paymentDto), environment: 'DEMO PAYMENT ENVIRONMENT', enabled: config.enabled, scenario: config.scenario };
}
