import QRCode from 'qrcode';
import { ApiError } from '../utils/ApiError.js';

export const ticketInclude = { booking: { include: {
  user: { select: { fullName: true } },
  schedule: { include: { train: true, route: { include: { originStation: true, destinationStation: true } } } },
  scheduleSeat: { include: { seat: true } },
  payments: { select: { status: true, amount: true, currency: true, isDemo: true } },
} } };

// Evaluate current database state, including revocation after a PDF was saved.
// Reading a passenger ticket never marks it USED; boarding is a separate operation.
export function ticketValidity(ticket, now = new Date()) {
  const b = ticket.booking;
  const paid = b.payments.some(p => p.status === 'PAID' && p.amount.equals(b.amount) && p.currency === b.currency);
  if (ticket.status === 'CANCELLED' || b.bookingStatus === 'CANCELLED' || b.paymentStatus !== 'PAID' || !paid || b.schedule.status === 'CANCELLED') {
    return { status: 'CANCELLED', valid: false, message: 'This ticket is cancelled or no longer supported by a successful payment.' };
  }
  if (ticket.status === 'USED' || ticket.usedAt) return { status: 'USED', valid: false, message: 'This ticket has already been used.' };
  if (ticket.status === 'EXPIRED' || ticket.expiresAt <= now || b.schedule.arrivalTime <= now || ['EXPIRED', 'COMPLETED'].includes(b.bookingStatus) || b.schedule.status === 'COMPLETED') {
    return { status: 'EXPIRED', valid: false, message: 'This ticket has expired or its journey is complete.' };
  }
  if (ticket.status !== 'VALID' || b.bookingStatus !== 'CONFIRMED' || b.activeScheduleSeatId !== b.scheduleSeatId || b.scheduleSeat.status !== 'BOOKED') {
    return { status: 'CANCELLED', valid: false, message: 'This ticket no longer has a confirmed seat reservation.' };
  }
  return { status: 'VALID', valid: true, message: 'The ticket has a confirmed booking, successful payment and reserved seat.' };
}

function dto(row, now) {
  const b = row.booking, s = b.schedule;
  return { id: row.id, bookingId: b.id, ticketNumber: row.ticketNumber, bookingReference: b.bookingReference,
    passengerName: b.user.fullName, ...ticketValidity(row, now), issuedAt: row.issuedAt, expiresAt: row.expiresAt,
    train: { name: s.train.name, code: s.train.code }, origin: s.route.originStation.name, destination: s.route.destinationStation.name,
    departureTime: s.departureTime, arrivalTime: s.arrivalTime, timezone: 'Africa/Lagos',
    seatNumber: b.scheduleSeat.seat.seatNumber, seatClass: b.scheduleSeat.seat.seatClass, fare: b.amount.toFixed(2), currency: b.currency,
    isDemo: b.payments.some(p => p.isDemo) || s.isDemo || s.train.isDemo || s.route.isDemo };
}

export async function listMyTickets(db, userId, { page, pageSize }) {
  const where = { booking: { userId } };
  const [rows, total] = await db.$transaction([
    db.ticket.findMany({ where, include: ticketInclude, orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db.ticket.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  const serverTime = new Date();
  return { items: rows.map(row => dto(row, serverTime)), total, page, pages: Math.ceil(total / pageSize), pageSize, serverTime };
}

export async function getMyTicket(db, userId, id) {
  const row = await db.$transaction(tx => tx.ticket.findFirst({ where: { id, booking: { userId } }, include: ticketInclude }), { isolationLevel: 'RepeatableRead' });
  if (!row) throw new ApiError(404, 'This ticket could not be found. Tickets are issued only after successful payment.');
  const serverTime = new Date();
  // Exactly the opaque, random token; no name, booking details or token in URLs.
  const qrDataUrl = await QRCode.toDataURL(row.qrToken, { errorCorrectionLevel: 'H', margin: 4, scale: 6, type: 'image/png' });
  return { ticket: { ...dto(row, serverTime), qrDataUrl }, serverTime };
}

export async function verifyTicketToken(db, token) {
  const row = await db.$transaction(tx => tx.ticket.findUnique({ where: { qrToken: token }, include: ticketInclude }), { isolationLevel: 'RepeatableRead' });
  const checkedAt = new Date();
  if (!row) return { valid: false, status: 'INVALID', message: 'This ticket could not be verified.', checkedAt };
  const ticket = dto(row, checkedAt);
  return { valid: ticket.valid, status: ticket.status, message: ticket.message, ticketNumber: ticket.ticketNumber, isDemo: ticket.isDemo, checkedAt };
}
