import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createDatabaseClient } from '../src/config/database.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') {
  throw new Error('Database tests require ALLOW_DB_TESTS=true and a non-production database.');
}

const prisma = createDatabaseClient();
const tag = randomBytes(6).toString('hex');
let fixture;

before(async () => {
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
  fixture = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { fullName: 'Database test fixture', email: `${tag}@example.test`, phone: `+0${tag}`, passwordHash, isDemo: true } });
    const officer = await tx.user.create({ data: { fullName: 'Database test officer', email: `officer-${tag}@example.test`, phone: `+1${tag}`, passwordHash, role: 'TICKET_OFFICER', isDemo: true } });
    const origin = await tx.station.create({ data: { code: `T-A-${tag}`, name: 'Test origin', city: 'Test', state: 'Test', isDemo: true } });
    const destination = await tx.station.create({ data: { code: `T-B-${tag}`, name: 'Test destination', city: 'Test', state: 'Test', isDemo: true } });
    const route = await tx.route.create({ data: { originStationId: origin.id, destinationStationId: destination.id, distanceKm: '100.00', estimatedDuration: 60, isDemo: true } });
    const train = await tx.train.create({ data: { code: `T-A-${tag}`, name: 'Test train', capacity: 2, isDemo: true } });
    const otherTrain = await tx.train.create({ data: { code: `T-B-${tag}`, name: 'Other test train', capacity: 1, isDemo: true } });
    const seats = await Promise.all(['E01', 'E02'].map(seatNumber => tx.seat.create({ data: { trainId: train.id, seatNumber, seatClass: 'ECONOMY' } })));
    const otherSeat = await tx.seat.create({ data: { trainId: otherTrain.id, seatNumber: 'E01', seatClass: 'ECONOMY' } });
    const departureTime = new Date(Date.now() + 86400000);
    const schedule = await tx.schedule.create({ data: { trainId: train.id, routeId: route.id, departureTime, arrivalTime: new Date(departureTime.getTime() + 3600000), fareEconomy: '5000.00', fareBusiness: '9000.00', isDemo: true } });
    const rows = await Promise.all(seats.map(seat => tx.scheduleSeat.create({ data: { scheduleId: schedule.id, seatId: seat.id, trainId: train.id } })));
    return { user, officer, origin, destination, route, train, otherTrain, seats, otherSeat, schedule, rows };
  }, { timeout: 30000 });
});

after(async () => {
  try {
    if (fixture) await prisma.$transaction(async (tx) => {
      // All non-race tests roll back. Only this run's random fixture IDs are removed.
      await tx.booking.deleteMany({ where: { userId: fixture.user.id } });
      await tx.scheduleSeat.deleteMany({ where: { scheduleId: fixture.schedule.id } });
      await tx.schedule.delete({ where: { id: fixture.schedule.id } });
      await tx.seat.deleteMany({ where: { trainId: { in: [fixture.train.id, fixture.otherTrain.id] } } });
      await tx.train.deleteMany({ where: { id: { in: [fixture.train.id, fixture.otherTrain.id] } } });
      await tx.route.delete({ where: { id: fixture.route.id } });
      await tx.station.deleteMany({ where: { id: { in: [fixture.origin.id, fixture.destination.id] } } });
      await tx.user.deleteMany({ where: { id: { in: [fixture.user.id, fixture.officer.id] } } });
    });
  } finally { await prisma.$disconnect(); }
});

async function rollback(work) {
  const marker = new Error('Intentional test rollback');
  try {
    await prisma.$transaction(async (tx) => { await work(tx); throw marker; }, { timeout: 20000 });
  } catch (error) { if (error !== marker) throw error; }
}

function bookingData(overrides = {}) {
  return {
    bookingReference: `TST-${randomBytes(12).toString('hex')}`, userId: fixture.user.id,
    scheduleId: fixture.schedule.id, scheduleSeatId: fixture.rows[0].id,
    activeScheduleSeatId: fixture.rows[0].id, amount: '5000.00', ...overrides,
  };
}

async function paidBooking(tx, index = 0) {
  const booking = await tx.booking.create({ data: bookingData({
    scheduleSeatId: fixture.rows[index].id, activeScheduleSeatId: fixture.rows[index].id,
    bookingStatus: 'CONFIRMED', paymentStatus: 'PAID',
  }) });
  await tx.payment.create({ data: {
    bookingId: booking.id, transactionReference: `TST-${randomBytes(12).toString('hex')}`,
    amount: '5000.00', paymentMethod: 'CARD', status: 'PAID', paidAt: new Date(), isDemo: true,
  } });
  return booking;
}

const ticketData = (bookingId, overrides = {}) => ({
  bookingId, ticketNumber: `TST-${randomBytes(12).toString('hex')}`,
  qrToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 86400000), ...overrides,
});

test('all thirteen domain tables exist', async () => {
  const tables = await prisma.$queryRaw`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
  for (const name of ['User','Station','Route','Train','Seat','Schedule','ScheduleSeat','Booking','Payment','Ticket','TicketScanLog','FraudAlert','AuditLog']) {
    assert.ok(tables.some(table => table.name.toLowerCase() === name.toLowerCase()), `${name} missing`);
  }
});

test('duplicate schedule-seat pairs and seat numbers are rejected', () => rollback(async tx => {
  await assert.rejects(tx.scheduleSeat.create({ data: { scheduleId: fixture.schedule.id, seatId: fixture.seats[0].id, trainId: fixture.train.id } }), { code: 'P2002' });
  await assert.rejects(tx.seat.create({ data: { trainId: fixture.train.id, seatNumber: 'E01', seatClass: 'ECONOMY' } }), { code: 'P2002' });
}));

test('composite foreign keys reject seats belonging to another train', () => rollback(async tx => {
  await assert.rejects(tx.scheduleSeat.create({ data: { scheduleId: fixture.schedule.id, seatId: fixture.otherSeat.id, trainId: fixture.train.id } }), { code: 'P2003' });
  await assert.rejects(tx.scheduleSeat.create({ data: { scheduleId: fixture.schedule.id, seatId: fixture.otherSeat.id, trainId: fixture.otherTrain.id } }), { code: 'P2003' });
}));

test('foreign keys prevent orphan records and deletion of referenced parents', () => rollback(async tx => {
  await assert.rejects(tx.booking.create({ data: bookingData({ userId: 'missing-user' }) }), { code: 'P2003' });
  await assert.rejects(tx.train.delete({ where: { id: fixture.train.id } }), { code: 'P2003' });
}));

test('a booking cannot reference a seat from a different schedule', () => rollback(async tx => {
  const departureTime = new Date(fixture.schedule.departureTime.getTime() + 86400000);
  const other = await tx.schedule.create({ data: {
    trainId: fixture.train.id, routeId: fixture.route.id, departureTime,
    arrivalTime: new Date(departureTime.getTime() + 3600000), fareEconomy: '5000', fareBusiness: '9000', isDemo: true,
  } });
  await assert.rejects(tx.booking.create({ data: bookingData({ scheduleId: other.id }) }), { code: 'P2003' });
}));

test('station pairs, user emails and booking references are unique', () => rollback(async tx => {
  await assert.rejects(tx.route.create({ data: { originStationId: fixture.origin.id, destinationStationId: fixture.destination.id, distanceKm: '100', estimatedDuration: 60 } }), { code: 'P2002' });
  await assert.rejects(tx.user.create({ data: { fullName: 'Duplicate', email: fixture.user.email, phone: `+2${tag}`, passwordHash: fixture.user.passwordHash } }), { code: 'P2002' });
  const data = bookingData({ bookingStatus: 'CANCELLED', activeScheduleSeatId: null });
  await tx.booking.create({ data });
  await assert.rejects(tx.booking.create({ data }), { code: 'P2002' });
}));

test('CHECK constraints reject invalid routes, times, fares and hold state', () => rollback(async tx => {
  await assert.rejects(tx.route.create({ data: { originStationId: fixture.origin.id, destinationStationId: fixture.origin.id, distanceKm: '1', estimatedDuration: 1 } }), /route_distinct_stations/);
  await assert.rejects(tx.schedule.update({ where: { id: fixture.schedule.id }, data: { arrivalTime: new Date(0) } }), /schedule_valid_times/);
  await assert.rejects(tx.schedule.update({ where: { id: fixture.schedule.id }, data: { fareEconomy: '-1.00' } }), /schedule_nonnegative_fares/);
  await assert.rejects(tx.scheduleSeat.update({ where: { id: fixture.rows[0].id }, data: { status: 'HELD' } }), /schedule_seat_hold_deadline/);
}));

test('active bookings must claim their own seat; cancelled bookings release it without losing history', () => rollback(async tx => {
  await assert.rejects(tx.booking.create({ data: bookingData({ activeScheduleSeatId: null }) }), /booking_active_seat_claim/);
  await assert.rejects(tx.booking.create({ data: bookingData({ activeScheduleSeatId: fixture.rows[1].id }) }), /booking_active_seat_claim/);
  const first = await tx.booking.create({ data: bookingData() });
  await tx.booking.update({ where: { id: first.id }, data: { bookingStatus: 'CANCELLED', activeScheduleSeatId: null } });
  const second = await tx.booking.create({ data: bookingData() });
  assert.notEqual(first.id, second.id);
  assert.equal(await tx.booking.count({ where: { scheduleSeatId: fixture.rows[0].id } }), 2);
}));

test('tickets require confirmed payment and have unique booking and QR token', () => rollback(async tx => {
  const pending = await tx.booking.create({ data: bookingData() });
  await assert.rejects(tx.ticket.create({ data: ticketData(pending.id) }), /Ticket requires a confirmed booking/);
  await tx.booking.update({ where: { id: pending.id }, data: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } });
  await assert.rejects(tx.ticket.create({ data: ticketData(pending.id) }), /Ticket requires a confirmed booking/);
  await tx.booking.delete({ where: { id: pending.id } });
  const first = await paidBooking(tx);
  const ticket = await tx.ticket.create({ data: ticketData(first.id) });
  await assert.rejects(tx.ticket.create({ data: ticketData(first.id) }), { code: 'P2002' });
  const second = await paidBooking(tx, 1);
  await assert.rejects(tx.ticket.create({ data: ticketData(second.id, { qrToken: ticket.qrToken }) }), { code: 'P2002' });
  await assert.rejects(tx.ticket.update({ where: { id: ticket.id }, data: { bookingId: second.id } }), /cannot be reassigned/);
}));

test('successful payment timestamps and used-ticket timestamps are required', () => rollback(async tx => {
  const booking = await paidBooking(tx);
  await assert.rejects(tx.payment.create({ data: { bookingId: booking.id, transactionReference: `T-${tag}`, amount: '1', paymentMethod: 'USSD', status: 'PAID' } }), /payment_paid_timestamp/);
  const ticket = await tx.ticket.create({ data: ticketData(booking.id) });
  await assert.rejects(tx.ticket.update({ where: { id: ticket.id }, data: { status: 'USED' } }), /ticket_used_timestamp/);
}));

test('scan logs, fraud subjects, reviewers and audit actors retain their relationships', () => rollback(async tx => {
  const booking = await paidBooking(tx);
  const ticket = await tx.ticket.create({ data: ticketData(booking.id) });
  const log = await tx.ticketScanLog.create({ data: { ticketId: ticket.id, officerId: fixture.officer.id, result: 'VALID' } });
  const alert = await tx.fraudAlert.create({ data: { userId: fixture.user.id, bookingId: booking.id, ticketId: ticket.id, type: 'ANOMALY_SCORE', severity: 'LOW', score: 10, description: 'Test fixture only' }, include: { user: true, booking: true, ticket: true } });
  assert.equal(alert.user.id, fixture.user.id);
  assert.equal(alert.booking.id, booking.id);
  assert.equal(alert.ticket.id, log.ticketId);
  await assert.rejects(tx.fraudAlert.update({ where: { id: alert.id }, data: { score: 101 } }), /fraud_score_range/);
  await tx.fraudAlert.update({ where: { id: alert.id }, data: { reviewedBy: fixture.officer.id, reviewedAt: new Date(), status: 'DISMISSED' } });
  const audit = await tx.auditLog.create({ data: { userId: fixture.officer.id, action: 'TEST_ALERT_REVIEW', entityType: 'FraudAlert', entityId: alert.id, metadata: { fixture: true } } });
  assert.equal(audit.entityId, alert.id);
  const invalid = await tx.ticketScanLog.create({ data: { officerId: fixture.officer.id, result: 'INVALID' } });
  assert.equal(invalid.ticketId, null);
}));

test('two simultaneous booking inserts for one seat produce exactly one winner', async () => {
  const results = await Promise.allSettled([
    prisma.booking.create({ data: bookingData() }),
    prisma.booking.create({ data: bookingData() }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failed = results.find(result => result.status === 'rejected');
  assert.equal(failed.reason.code, 'P2002');
  assert.equal(await prisma.booking.count({ where: { activeScheduleSeatId: fixture.rows[0].id } }), 1);
});
