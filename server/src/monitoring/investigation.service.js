import { ApiError } from '../utils/ApiError.js';
import { adminTransaction } from '../services/admin.service.js';
import { actorSelect, auditSelect, auditDto, writeAudit, safeEvidence, redactText } from './audit.js';

export const subjectSelect = { ...actorSelect, status: true };
export const alertSelect = { id: true, userId: true, bookingId: true, ticketId: true, type: true, severity: true, score: true, description: true, status: true, createdAt: true, updatedAt: true, user: { select: subjectSelect } };
const ticketSelect = { id: true, ticketNumber: true, status: true, issuedAt: true, usedAt: true, expiresAt: true };
const bookingSelect = { id: true, bookingReference: true, bookingStatus: true, paymentStatus: true, amount: true, currency: true, createdAt: true,
  user: { select: subjectSelect }, ticket: { select: ticketSelect },
  scheduleSeat: { select: { seat: { select: { seatNumber: true, seatClass: true } } } },
  schedule: { select: { departureTime: true, train: { select: { name: true } }, route: { select: { originStation: { select: { name: true } }, destinationStation: { select: { name: true } } } } } } };
const bookingDto = row => row ? { ...row, amount: row.amount.toFixed(2) } : null;
const missing = () => new ApiError(404, 'This alert could not be found.');

export async function alertDetails(db, id) {
  return db.$transaction(async tx => {
    const alert = await tx.fraudAlert.findUnique({ where: { id }, select: { ...alertSelect, features: true, reviewedAt: true, reviewNotes: true, reviewer: { select: actorSelect }, booking: { select: bookingSelect }, ticket: { select: ticketSelect } } });
    if (!alert) throw missing();
    const subject = alert.user ?? alert.booking?.user ?? null;
    const ticket = alert.ticket ?? alert.booking?.ticket ?? null;
    const recentBookings = subject?.role === 'PASSENGER' ? await tx.booking.findMany({ where: { userId: subject.id }, select: bookingSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 }) : [];
    // Invalid scans cannot identify a passenger; retain their officer context.
    const scanWhere = ticket ? { ticketId: ticket.id } : subject?.role === 'TICKET_OFFICER' ? { officerId: subject.id } : subject ? { ticket: { booking: { userId: subject.id } } } : null;
    const scans = scanWhere ? await tx.ticketScanLog.findMany({ where: scanWhere, orderBy: [{ scannedAt: 'desc' }, { id: 'desc' }], take: 20,
      select: { id: true, result: true, reason: true, scannedAt: true, officer: { select: actorSelect }, ticket: { select: { ticketNumber: true } } } }) : [];
    const historyWhere = { entityType: 'FraudAlert', entityId: id, action: 'FRAUD_ALERT_REVIEWED' };
    const history = await tx.auditLog.findMany({ where: historyWhere, select: auditSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 });
    const historyTotal = await tx.auditLog.count({ where: historyWhere });
    return { alert: { ...alert, description: redactText(alert.description), features: safeEvidence(alert.features), reviewNotes: alert.reviewNotes ? redactText(alert.reviewNotes) : null, booking: bookingDto(alert.booking), ticket },
      subject, recentBookings: recentBookings.map(bookingDto), scans: scans.map(row => ({ ...row, reason: row.reason ? redactText(row.reason) : null })), reviewHistory: history.map(auditDto), reviewHistoryTotal: historyTotal };
  }, { isolationLevel: 'RepeatableRead' });
}

export async function reviewAlert(db, id, actorId, input) {
  return adminTransaction(db, async tx => {
    await tx.$queryRaw`SELECT id FROM FraudAlert WHERE id = ${id} FOR UPDATE`;
    const alert = await tx.fraudAlert.findUnique({ where: { id }, select: { status: true, updatedAt: true } });
    if (!alert) throw missing();
    if (alert.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new ApiError(409, 'Another administrator changed this alert. Refresh the details before reviewing it.');
    if (alert.status === input.status) throw new ApiError(409, 'This alert already has that status. Refresh its review history.');
    const now = new Date(Math.max(Date.now(), alert.updatedAt.getTime() + 1));
    const note = redactText(input.note);
    const updated = await tx.fraudAlert.update({ where: { id }, data: { status: input.status, reviewedBy: actorId, reviewedAt: now, reviewNotes: note, updatedAt: now }, select: alertSelect });
    await writeAudit(tx, { actorId, action: 'FRAUD_ALERT_REVIEWED', entityType: 'FraudAlert', entityId: id,
      metadata: { fromStatus: alert.status, toStatus: input.status, note } });
    return { alert: updated };
  });
}

export async function investigateTicket(db, alertId, actorId, { note }) {
  return adminTransaction(db, async tx => {
    const alert = await tx.fraudAlert.findUnique({ where: { id: alertId }, select: { ticketId: true, booking: { select: { ticket: { select: { id: true } } } } } });
    if (!alert) throw missing();
    const ticketId = alert.ticketId ?? alert.booking?.ticket?.id;
    if (!ticketId) throw new ApiError(409, 'No identified ticket is associated with this alert.');
    const event = await writeAudit(tx, { actorId, action: 'TICKET_MANUALLY_INVESTIGATED', entityType: 'Ticket', entityId: ticketId, metadata: { alertId, note } });
    return { auditId: event.id };
  });
}

export async function changePassengerStatus(db, id, actorId, input) {
  return adminTransaction(db, async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${id} FOR UPDATE`;
    const passenger = await tx.user.findUnique({ where: { id }, select: subjectSelect });
    if (!passenger || passenger.role !== 'PASSENGER') throw new ApiError(404, 'This passenger could not be found.');
    if (passenger.status !== input.expectedStatus || passenger.status === input.status) throw new ApiError(409, 'This account status changed. Refresh before continuing.');
    await tx.user.update({ where: { id }, data: { status: input.status } });
    if (input.status === 'SUSPENDED') await tx.authSession.deleteMany({ where: { userId: id } });
    await writeAudit(tx, { actorId, action: input.status === 'SUSPENDED' ? 'PASSENGER_SUSPENDED' : 'PASSENGER_REACTIVATED', entityType: 'User', entityId: id,
      metadata: { fromStatus: passenger.status, toStatus: input.status, note: input.note } });
    return { passenger: { ...passenger, status: input.status } };
  });
}
