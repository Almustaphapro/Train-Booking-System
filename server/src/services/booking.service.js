import { randomInt } from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { assessActivity } from '../fraud/fraud.service.js';

export const HOLD_MILLISECONDS = 10 * 60 * 1000;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function bookingReference(now = new Date()) {
  return `TRN-${now.getUTCFullYear()}-${Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join('')}`;
}
const unavailable = () => new ApiError(409, 'That seat is no longer available. Please choose another seat.');
export async function bookingTransaction(db, work) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000 }); }
    catch (error) {
      if (['P2034', 'P2002'].includes(error.code) && attempt < 3) continue;
      if (['P2034', 'P2002', 'P2003', 'P2025'].includes(error.code)) throw unavailable();
      throw error;
    }
  }
}

const stationSelect = { id: true, name: true, code: true, status: true };
const scheduleInclude = {
  train: { select: { id: true, name: true, code: true, status: true, isDemo: true } },
  route: { select: { status: true, isDemo: true, originStation: { select: stationSelect }, destinationStation: { select: stationSelect } } },
};
const bookingInclude = { schedule: { include: scheduleInclude }, scheduleSeat: { include: { seat: true } }, ticket: { select: { id: true, ticketNumber: true, status: true, issuedAt: true, expiresAt: true } }, payments: { where: { status: 'PAID' }, select: { isDemo: true }, take: 1 } };
const canReserve = (schedule, now) => schedule.status === 'SCHEDULED' && schedule.departureTime > now &&
  [schedule.train.status, schedule.route.status, schedule.route.originStation.status, schedule.route.destinationStation.status].every(status => status === 'ACTIVE');
function scheduleDto(schedule) {
  return { id: schedule.id, train: { id: schedule.train.id, name: schedule.train.name, code: schedule.train.code },
    origin: { id: schedule.route.originStation.id, name: schedule.route.originStation.name }, destination: { id: schedule.route.destinationStation.id, name: schedule.route.destinationStation.name },
    departureTime: schedule.departureTime, arrivalTime: schedule.arrivalTime, fareEconomy: schedule.fareEconomy.toFixed(2), fareBusiness: schedule.fareBusiness.toFixed(2), currency: schedule.currency,
    isDemo: schedule.isDemo || schedule.train.isDemo || schedule.route.isDemo, status: schedule.status };
}
function bookingDto(booking) {
  return { id: booking.id, bookingReference: booking.bookingReference, bookingStatus: booking.bookingStatus, paymentStatus: booking.paymentStatus,
    amount: booking.amount.toFixed(2), currency: booking.currency, expiresAt: booking.expiresAt, createdAt: booking.createdAt,
    ticket: booking.ticket ? { ...booking.ticket, isDemo: booking.payments.some(row => row.isDemo) } : null,
    schedule: scheduleDto(booking.schedule), seat: { id: booking.scheduleSeat.seatId, seatNumber: booking.scheduleSeat.seat.seatNumber, seatClass: booking.scheduleSeat.seat.seatClass } };
}

// The read and both state changes share one serializable transaction. In
// particular, releasing an old hold cannot clear a newly acquired seat claim.
export async function releaseExpiredHolds(db, scope = {}, now = new Date()) {
  return bookingTransaction(db, async tx => {
    const expired = await tx.scheduleSeat.findMany({ where: { ...scope, status: 'HELD', heldUntil: { lte: now } },
      include: { activeBooking: true, seat: { select: { status: true } } }, orderBy: { id: 'asc' } });
    let released = 0;
    for (const inventory of expired) {
      const booking = inventory.activeBooking;
      // A paid/confirmed claim must never be released by the hold worker.
      if (booking && (booking.bookingStatus !== 'PENDING' || !['PENDING', 'FAILED'].includes(booking.paymentStatus))) continue;
      if (booking) {
        const failed = await tx.payment.updateMany({ where: { bookingId: booking.id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'The seat hold expired before payment completed. No money was charged.' } });
        await tx.booking.update({ where: { id: booking.id }, data: { bookingStatus: 'EXPIRED', activeScheduleSeatId: null, ...(failed.count ? { paymentStatus: 'FAILED' } : {}) } });
        await tx.auditLog.create({ data: { action: 'BOOKING_EXPIRED', entityType: 'Booking', entityId: booking.id } });
      }
      await tx.scheduleSeat.update({ where: { id: inventory.id }, data: { status: inventory.seat.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED', heldUntil: null } });
      released++;
    }
    return released;
  });
}

export async function getScheduleSeats(db, scheduleId) {
  await releaseExpiredHolds(db, { scheduleId });
  return db.$transaction(async tx => {
    const schedule = await tx.schedule.findUnique({ where: { id: scheduleId }, include: scheduleInclude });
    if (!schedule) throw new ApiError(404, 'This journey could not be found.');
    const now = new Date();
    const seats = await tx.scheduleSeat.findMany({ where: { scheduleId }, include: { seat: true, activeBooking: { select: { bookingStatus: true } } }, orderBy: { seat: { seatNumber: 'asc' } } });
    return { schedule: scheduleDto(schedule), reservable: canReserve(schedule, now), serverTime: now, holdMinutes: 10,
      seats: seats.map(row => ({ id: row.seatId, seatNumber: row.seat.seatNumber, seatClass: row.seat.seatClass,
        status: row.seat.status !== 'ACTIVE' || row.status === 'BLOCKED' ? 'BLOCKED' : row.activeBooking && row.status === 'AVAILABLE' ? 'BOOKED' : row.status,
        heldUntil: row.status === 'HELD' ? row.heldUntil : null, fare: (row.seat.seatClass === 'ECONOMY' ? schedule.fareEconomy : schedule.fareBusiness).toFixed(2) })) };
  }, { isolationLevel: 'RepeatableRead' });
}

export async function createPendingBooking(db, userId, input) {
  await releaseExpiredHolds(db, { scheduleId: input.scheduleId });
  return bookingTransaction(db, async tx => {
    // Serializable reads also coordinate with administrator edits to the
    // schedule, route, train and physical seat before the inventory write.
    const schedule = await tx.schedule.findUnique({ where: { id: input.scheduleId }, include: scheduleInclude });
    if (!schedule) throw new ApiError(404, 'This journey could not be found.');
    const now = new Date();
    if (!canReserve(schedule, now)) throw new ApiError(409, 'This journey is no longer open for reservations. Please search again.');
    const inventory = await tx.scheduleSeat.findUnique({ where: { scheduleId_seatId: { scheduleId: schedule.id, seatId: input.seatId } }, include: { seat: true, activeBooking: { select: { id: true } } } });
    if (!inventory || inventory.seat.status !== 'ACTIVE' || inventory.status !== 'AVAILABLE' || inventory.heldUntil || inventory.activeBooking) throw unavailable();
    const amount = inventory.seat.seatClass === 'ECONOMY' ? schedule.fareEconomy : schedule.fareBusiness;
    if (amount.toFixed(2) !== input.expectedAmount) throw new ApiError(409, 'The fare has changed. Refresh the booking review before reserving.');
    const expiresAt = new Date(Math.min(Date.now() + HOLD_MILLISECONDS, schedule.departureTime.getTime()));
    const claimed = await tx.scheduleSeat.updateMany({ where: { id: inventory.id, status: 'AVAILABLE', heldUntil: null, activeBooking: { is: null } }, data: { status: 'HELD', heldUntil: expiresAt } });
    if (claimed.count !== 1) throw unavailable();
    const booking = await tx.booking.create({ data: { userId, scheduleId: schedule.id, scheduleSeatId: inventory.id, activeScheduleSeatId: inventory.id,
      bookingReference: bookingReference(now), amount, currency: schedule.currency, bookingStatus: 'PENDING', paymentStatus: 'PENDING', expiresAt }, include: bookingInclude });
    const event = await tx.auditLog.create({ data: { userId, action: 'BOOKING_CREATED', entityType: 'Booking', entityId: booking.id } });
    await assessActivity(tx, { userId, sourceType: 'BOOKING_CREATED', sourceId: event.id, bookingId: booking.id });
    return { booking: bookingDto(booking), serverTime: new Date() };
  });
}

export async function getMyBooking(db, userId, id) {
  const own = await db.booking.findFirst({ where: { id, userId }, select: { scheduleId: true } });
  if (!own) throw new ApiError(404, 'This booking could not be found.');
  await releaseExpiredHolds(db, { scheduleId: own.scheduleId });
  const booking = await db.booking.findFirst({ where: { id, userId }, include: bookingInclude });
  if (!booking) throw new ApiError(404, 'This booking could not be found.');
  return { booking: bookingDto(booking), serverTime: new Date() };
}
export async function listMyBookings(db, userId, { page, pageSize }) {
  await releaseExpiredHolds(db, { activeBooking: { is: { userId } } });
  const [bookings, total] = await db.$transaction([
    db.booking.findMany({ where: { userId }, include: bookingInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db.booking.count({ where: { userId } }),
  ], { isolationLevel: 'RepeatableRead' });
  return { items: bookings.map(bookingDto), total, page, pageSize, pages: Math.ceil(total / pageSize), serverTime: new Date() };
}
export async function cancelPendingBooking(db, userId, id) {
  await getMyBooking(db, userId, id);
  await bookingTransaction(db, async tx => {
    const booking = await tx.booking.findFirst({ where: { id, userId }, include: { scheduleSeat: { include: { seat: true } } } });
    if (!booking) throw new ApiError(404, 'This booking could not be found.');
    if (booking.bookingStatus === 'CANCELLED') return;
    if (booking.bookingStatus !== 'PENDING' || !['PENDING', 'FAILED'].includes(booking.paymentStatus)) throw new ApiError(409, 'Only an unpaid pending reservation can be cancelled here.');
    const failed = await tx.payment.updateMany({ where: { bookingId: id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'The reservation was cancelled before payment completed. No money was charged.' } });
    await tx.booking.update({ where: { id }, data: { bookingStatus: 'CANCELLED', activeScheduleSeatId: null, ...(failed.count ? { paymentStatus: 'FAILED' } : {}) } });
    await tx.scheduleSeat.update({ where: { id: booking.scheduleSeatId }, data: { status: booking.scheduleSeat.seat.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED', heldUntil: null } });
    const event = await tx.auditLog.create({ data: { userId, action: 'BOOKING_CANCELLED', entityType: 'Booking', entityId: id } });
    await assessActivity(tx, { userId, sourceType: 'BOOKING_CANCELLED', sourceId: event.id, bookingId: id });
  });
  return getMyBooking(db, userId, id);
}
