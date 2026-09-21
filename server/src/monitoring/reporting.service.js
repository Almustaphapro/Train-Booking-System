import { railwayDate, travelDayBounds } from '../services/search.service.js';
import { dateRange } from './monitoring.validators.js';
import { auditSelect, auditDto } from './audit.js';

export async function monitoringReport(db, query, now = new Date()) {
  const range = dateRange(query, { defaults: true, now }), today = travelDayBounds(railwayDate(now));
  return db.$transaction(async tx => {
    const totalPassengers = await tx.user.count({ where: { role: 'PASSENGER' } });
    const totalBookings = await tx.booking.count();
    const todaysBookings = await tx.booking.count({ where: { createdAt: { gte: today.start, lt: today.end } } });
    const paid = await tx.payment.aggregate({ where: { status: 'PAID', currency: 'NGN' }, _sum: { amount: true } });
    const activeSchedules = await tx.schedule.count({ where: { status: { in: ['SCHEDULED', 'BOARDING', 'DEPARTED'] }, arrivalTime: { gt: now } } });
    const ticketsIssued = await tx.ticket.count();
    const [verified] = await tx.$queryRaw`SELECT COUNT(DISTINCT ticketId) AS total FROM TicketScanLog WHERE result IN ('VALID', 'BOARDED')`;
    const openFraudAlerts = await tx.fraudAlert.count({ where: { status: { in: ['NEW', 'UNDER_REVIEW'] } } });
    const bookingDays = await tx.$queryRaw`SELECT DATE_FORMAT(DATE_ADD(createdAt, INTERVAL 1 HOUR), '%Y-%m-%d') AS day, COUNT(*) AS total
      FROM Booking WHERE createdAt >= ${range.start} AND createdAt < ${range.end} GROUP BY day ORDER BY day`;
    const revenueDays = await tx.$queryRaw`SELECT DATE_FORMAT(DATE_ADD(paidAt, INTERVAL 1 HOUR), '%Y-%m-%d') AS day, SUM(amount) AS total
      FROM Payment WHERE status = 'PAID' AND currency = 'NGN' AND paidAt >= ${range.start} AND paidAt < ${range.end} GROUP BY day ORDER BY day`;
    const statuses = await tx.booking.groupBy({ by: ['bookingStatus'], where: { createdAt: range.where }, _count: { _all: true } });
    const routes = await tx.$queryRaw`SELECT r.id, origin.name AS origin, destination.name AS destination, COUNT(*) AS total
      FROM Booking b JOIN Schedule s ON s.id = b.scheduleId JOIN Route r ON r.id = s.routeId
      JOIN Station origin ON origin.id = r.originStationId JOIN Station destination ON destination.id = r.destinationStationId
      WHERE b.createdAt >= ${range.start} AND b.createdAt < ${range.end}
      GROUP BY r.id, origin.name, destination.name ORDER BY total DESC, r.id ASC LIMIT 8`;
    const bookingMap = new Map(bookingDays.map(row => [row.day, Number(row.total)]));
    const revenueMap = new Map(revenueDays.map(row => [row.day, row.total.toFixed(2)]));
    const daily = [];
    for (let time = range.start.getTime(); time < range.end.getTime(); time += 86400000) {
      const date = railwayDate(new Date(time)); daily.push({ date, bookings: bookingMap.get(date) ?? 0, revenue: revenueMap.get(date) ?? '0.00' });
    }
    return { asOf: now, timezone: 'Africa/Lagos', currency: 'NGN', range: { from: range.from, to: range.to },
      counts: { totalPassengers, totalBookings, todaysBookings, revenue: paid._sum.amount?.toFixed(2) ?? '0.00', activeSchedules, ticketsIssued, ticketsVerified: Number(verified.total), openFraudAlerts },
      daily, bookingStatuses: ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED'].map(status => ({ status, count: statuses.find(row => row.bookingStatus === status)?._count._all ?? 0 })),
      popularRoutes: routes.map(row => ({ id: row.id, origin: row.origin, destination: row.destination, bookings: Number(row.total) })) };
  }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
}

export async function listAuditLogs(db, query) {
  const { page, pageSize, from, to, actorId, actorRole, ...filters } = query;
  const range = dateRange({ from, to });
  const where = { ...filters, ...(actorId ? { userId: actorId } : {}), ...(actorRole ? { user: { role: actorRole } } : {}), ...(from || to ? { createdAt: range.where } : {}) };
  const [items, total] = await db.$transaction([
    db.auditLog.findMany({ where, select: auditSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db.auditLog.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return { items: items.map(auditDto), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
