import { dateRange } from './monitoring.validators.js';

const bookingSelect = { id: true, bookingReference: true, bookingStatus: true, paymentStatus: true, amount: true, currency: true, createdAt: true,
  user: { select: { id: true, fullName: true } },
  schedule: { select: { departureTime: true, isDemo: true, train: { select: { name: true } }, route: { select: { originStation: { select: { name: true } }, destinationStation: { select: { name: true } } } } } },
  scheduleSeat: { select: { seat: { select: { seatNumber: true, seatClass: true } } } },
  ticket: { select: { ticketNumber: true, status: true } } };
const paymentSelect = { id: true, transactionReference: true, paymentMethod: true, status: true, amount: true, currency: true, isDemo: true, createdAt: true, paidAt: true,
  booking: { select: { id: true, bookingReference: true, user: { select: { id: true, fullName: true } } } } };
export async function listActivity(db, resource, { q, status, from, to, page, pageSize }) {
  const range = dateRange({ from, to }), isBooking = resource === 'bookings', model = isBooking ? 'booking' : 'payment';
  const where = { ...(status ? { [isBooking ? 'bookingStatus' : 'status']: status } : {}), ...(from || to ? { createdAt: range.where } : {}),
    ...(q ? { OR: isBooking ? [{ bookingReference: { contains: q } }, { user: { fullName: { contains: q } } }]
      : [{ transactionReference: { contains: q } }, { booking: { bookingReference: { contains: q } } }, { booking: { user: { fullName: { contains: q } } } }] } : {}) };
  const [items, total] = await db.$transaction([
    db[model].findMany({ where, select: isBooking ? bookingSelect : paymentSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db[model].count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return { items: items.map(row => ({ ...row, amount: row.amount.toFixed(2) })), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
