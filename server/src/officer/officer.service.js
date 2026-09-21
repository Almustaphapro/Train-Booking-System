import { createHash } from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { ticketInclude, ticketValidity } from '../tickets/ticket.service.js';
import { railwayDate, travelDayBounds } from '../services/search.service.js';

export const VERIFICATION_TTL_MS = 2 * 60 * 1000;
const scheduleInclude = { train: { select: { name: true, code: true, isDemo: true } }, route: { include: { originStation: true, destinationStation: true } } };
const openForBoarding = (s, now) => ['SCHEDULED', 'BOARDING'].includes(s.status) && s.departureTime > now && s.arrivalTime > now;
const scheduleDto = (s, now) => ({ id: s.id, train: s.train.name, trainCode: s.train.code, origin: s.route.originStation.name, destination: s.route.destinationStation.name,
  departureTime: s.departureTime, arrivalTime: s.arrivalTime, status: s.status, boardable: openForBoarding(s, now), isDemo: s.isDemo || s.train.isDemo || s.route.isDemo });

export async function officerTransaction(db, work) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000 }); }
    catch (error) {
      if (error.code === 'P2034' && attempt < 3) continue;
      if (error.code === 'P2034') throw new ApiError(409, 'Another operation is updating this ticket. Verify it again before boarding.');
      throw error;
    }
  }
}

function check(row, scheduleId, now) {
  if (!row) return { valid: false, status: 'INVALID', message: 'No ticket matches this entry. Check the QR token or ticket number.' };
  // Always show the original usage time, even if the journey has since ended.
  if (row.status === 'USED' || row.usedAt) return { valid: false, status: 'ALREADY_USED', message: 'This ticket has already been used. Do not board this ticket again.' };
  const validity = ticketValidity(row, now);
  if (!validity.valid) return validity;
  if (row.booking.scheduleId !== scheduleId) return { valid: false, status: 'WRONG_SCHEDULE', message: 'This ticket is for a different departure. Check the selected train and schedule.' };
  if (!openForBoarding(row.booking.schedule, now)) return { valid: false, status: 'SCHEDULE_CLOSED', message: 'Boarding is closed. The schedule has departed or is not open for boarding.' };
  return { valid: true, status: 'VALID', message: 'Payment and reservation verified. Check the passenger details before confirming boarding.' };
}

function resultDto(row, result, now) {
  const b = row?.booking, s = b?.schedule;
  return { ...result, checkedAt: now, usedAt: row?.usedAt ?? null,
    ticket: row ? { id: row.id, ticketNumber: row.ticketNumber, passengerName: b.user.fullName,
      train: s.train.name, origin: s.route.originStation.name, destination: s.route.destinationStation.name,
      departureTime: s.departureTime, arrivalTime: s.arrivalTime, seatNumber: b.scheduleSeat.seat.seatNumber,
      seatClass: b.scheduleSeat.seat.seatClass, isDemo: s.isDemo || s.train.isDemo || s.route.isDemo || b.payments.some(p => p.isDemo) } : null };
}
function log(tx, { row, officerId, scheduleId, result, fingerprint, ipAddress, now }) {
  const storedResult = ['WRONG_SCHEDULE', 'SCHEDULE_CLOSED', 'VERIFICATION_EXPIRED'].includes(result.status) ? 'REJECTED' : result.status;
  return tx.ticketScanLog.create({ data: { ticketId: row?.id ?? null, officerId, scheduleId, result: storedResult,
    reason: result.message, tokenFingerprint: fingerprint, ipAddress, scannedAt: now } });
}

export async function verifyForBoarding(db, officerId, { entry, scheduleId }, ipAddress) {
  const token = /^[a-f0-9]{64}$/i.test(entry), normalized = token ? entry.toLowerCase() : entry.toUpperCase();
  const fingerprint = createHash('sha256').update(`${token ? 'token' : 'number'}:${normalized}`).digest('hex');
  return officerTransaction(db, async tx => {
    if (!await tx.schedule.findUnique({ where: { id: scheduleId }, select: { id: true } })) throw new ApiError(404, 'Select an existing boarding schedule.');
    const row = await tx.ticket.findUnique({ where: token ? { qrToken: normalized } : { ticketNumber: normalized }, include: ticketInclude });
    const now = new Date(), result = check(row, scheduleId, now);
    const scan = await log(tx, { row, officerId, scheduleId, result, fingerprint, ipAddress, now });
    return { ...resultDto(row, result, now), verificationId: result.valid ? scan.id : null, confirmBefore: result.valid ? new Date(now.getTime() + VERIFICATION_TTL_MS) : null };
  });
}

export async function confirmBoarding(db, officerId, verificationId, ipAddress) {
  return officerTransaction(db, async tx => {
    const verification = await tx.ticketScanLog.findFirst({ where: { id: verificationId, officerId, result: 'VALID' } });
    if (!verification?.ticketId || !verification.scheduleId) throw new ApiError(404, 'Verify this ticket with your account before confirming boarding.');
    const row = await tx.ticket.findUnique({ where: { id: verification.ticketId }, include: ticketInclude });
    const now = new Date(); let result = check(row, verification.scheduleId, now);
    if (result.valid && now.getTime() - verification.scannedAt.getTime() >= VERIFICATION_TTL_MS) result = { valid: false, status: 'VERIFICATION_EXPIRED', message: 'This verification has expired. Verify the ticket again before boarding.' };
    if (result.valid) {
      // The conditional write and serializable reads coordinate competing officers,
      // cancellation and payment changes. Logging failure rolls this write back.
      const changed = await tx.ticket.updateMany({ where: { id: row.id, status: 'VALID', usedAt: null }, data: { status: 'USED', usedAt: now } });
      if (changed.count !== 1) throw new ApiError(409, 'The ticket changed while boarding. Verify it again.');
      row.usedAt = now;
      result = { valid: false, status: 'BOARDED', message: 'Boarding confirmed. This ticket is now used and cannot board again.' };
      await tx.auditLog.create({ data: { userId: officerId, action: 'TICKET_BOARDED', entityType: 'Ticket', entityId: row.id, ipAddress,
        metadata: { verificationId, scheduleId: verification.scheduleId } } });
    }
    await log(tx, { row, officerId, scheduleId: verification.scheduleId, result, fingerprint: verification.tokenFingerprint, ipAddress, now });
    return resultDto(row, result, now);
  });
}

export async function listOfficerSchedules(db, date) {
  const { start, end } = travelDayBounds(date), now = new Date();
  const rows = await db.schedule.findMany({ where: { departureTime: { gte: start, lt: end } }, include: scheduleInclude, orderBy: [{ departureTime: 'asc' }, { id: 'asc' }] });
  return { items: rows.map(s => scheduleDto(s, now)), date, serverTime: now, timezone: 'Africa/Lagos' };
}

export async function officerActivity(db, officerId) {
  const date = railwayDate(), { start, end } = travelDayBounds(date), where = { officerId, scannedAt: { gte: start, lt: end } };
  const [counts, recent] = await db.$transaction([
    db.ticketScanLog.groupBy({ by: ['result'], where, _count: { _all: true } }),
    db.ticketScanLog.findMany({ where, orderBy: [{ scannedAt: 'desc' }, { id: 'desc' }], take: 20,
      select: { id: true, result: true, reason: true, scannedAt: true, ticket: { select: { ticketNumber: true } }, schedule: { select: { departureTime: true, train: { select: { name: true } } } } } }),
  ], { isolationLevel: 'RepeatableRead' });
  const totals = Object.fromEntries(counts.map(c => [c.result, c._count._all]));
  return { date, boarded: totals.BOARDED ?? 0, validChecks: totals.VALID ?? 0,
    rejected: counts.filter(c => !['VALID', 'BOARDED'].includes(c.result)).reduce((sum, c) => sum + c._count._all, 0), recent };
}
