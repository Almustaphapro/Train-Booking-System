import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseAuthConfig } from '../src/config/auth.js';
import { signSession } from '../src/security/tokens.js';
import { env } from '../src/config/env.js';
import { releaseExpiredHolds } from '../src/services/booking.service.js';
import { settlePayment } from '../src/payments/payment.service.js';
import { demoProvider } from '../src/payments/providers/demo.provider.js';
import { startPaymentWorker } from '../src/payments/payment.worker.js';
import { parsePaymentConfig } from '../src/config/payments.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('Payment tests require ALLOW_DB_TESTS=true and a non-production database.');
const db = createDatabaseClient(), tag = randomBytes(5).toString('hex'), config = parseAuthConfig();
const users = [], cookies = [], stations = [], schedules = [], seats = [];
let train, route, server, base; const otherServers = [], bases = {};
const headers = { Origin: env.clientUrls[0], 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
async function request(path, { cookie = cookies[0], body, method = body ? 'POST' : 'GET', extraHeaders = {}, apiBase = base } = {}) {
  const response = await fetch(`${apiBase}${path}`, { method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const input = (index, schedule = schedules[0]) => ({ scheduleId: schedule.id, seatId: seats[index].id, expectedAmount: seats[index].seatClass === 'ECONOMY' ? '2500.00' : '5000.00' });
const reserve = (index, options = {}) => request('/bookings', { body: input(index), ...options });
before(async () => {
  for (const [index, role] of ['PASSENGER', 'PASSENGER', 'ADMIN', 'TICKET_OFFICER'].entries()) {
    const user = await db.user.create({ data: { fullName: `Payment test ${index}`, email: `${index}@payment-${tag}.test`, phone: `+8${index}${BigInt(`0x${tag}`)}`, passwordHash: 'unused-test-hash', role } }); users.push(user);
    const session = await db.authSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) } }); cookies.push(`${config.cookieName}=${signSession(session, config)}`);
  }
  for (const suffix of ['A', 'B']) stations.push(await db.station.create({ data: { name: `Booking ${tag} ${suffix}`, code: `${tag}-${suffix}`, city: 'Test', state: 'Test' } }));
  route = await db.route.create({ data: { originStationId: stations[0].id, destinationStationId: stations[1].id, distanceKm: '100', estimatedDuration: 90 } });
  train = await db.train.create({ data: { name: `Booking ${tag}`, code: tag, capacity: 40 } });
  for (let i = 0; i < 40; i++) seats.push(await db.seat.create({ data: { trainId: train.id, seatNumber: `S${i + 1}`, seatClass: i === 1 ? 'BUSINESS' : 'ECONOMY', status: 'ACTIVE' } }));
  for (let i = 0; i < 2; i++) {
    const departureTime = new Date(Date.now() + (10 + i) * 86400000);
    const schedule = await db.schedule.create({ data: { trainId: train.id, routeId: route.id, departureTime, arrivalTime: new Date(departureTime.getTime() + 5400000), fareEconomy: '2500', fareBusiness: '5000' } }); schedules.push(schedule);
    await db.scheduleSeat.createMany({ data: seats.map(seat => ({ trainId: train.id, seatId: seat.id, scheduleId: schedule.id, status: seat.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED' })) });
  }
  server = createApp({ database: db, paymentConfig: { enabled: true, scenario: 'SUCCESS' } }).listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve)); for (const listener of otherServers) await new Promise(resolve => listener.close(resolve));
  try { await db.$transaction(async tx => {
    const bookings = await tx.booking.findMany({ where: { userId: { in: users.map(row => row.id) } }, select: { id: true } });
    const paymentIds = (await tx.payment.findMany({ where: { bookingId: { in: bookings.map(row => row.id) } }, select: { id: true } })).map(row => row.id);
    const ticketIds = (await tx.ticket.findMany({ where: { bookingId: { in: bookings.map(row => row.id) } }, select: { id: true } })).map(row => row.id);
    await tx.fraudAlert.deleteMany({ where: { userId: { in: users.map(row => row.id) } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ entityType: 'Payment', entityId: { in: paymentIds } }, { entityType: 'Ticket', entityId: { in: ticketIds } }] } });
    await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: users.map(row => row.id) } }, { entityType: 'Booking', entityId: { in: bookings.map(row => row.id) } }] } });
    await tx.ticket.deleteMany({ where: { bookingId: { in: bookings.map(row => row.id) } } });
    await tx.payment.deleteMany({ where: { bookingId: { in: bookings.map(row => row.id) } } });
    await tx.booking.deleteMany({ where: { userId: { in: users.map(row => row.id) } } });
    await tx.scheduleSeat.deleteMany({ where: { scheduleId: { in: schedules.map(row => row.id) } } });
    await tx.schedule.deleteMany({ where: { id: { in: schedules.map(row => row.id) } } });
    if (train) { await tx.seat.deleteMany({ where: { trainId: train.id } }); await tx.train.delete({ where: { id: train.id } }); }
    if (route) await tx.route.delete({ where: { id: route.id } }); await tx.station.deleteMany({ where: { id: { in: stations.map(row => row.id) } } });
    await tx.authSession.deleteMany({ where: { userId: { in: users.map(row => row.id) } } }); await tx.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
  }); } finally { await db.$disconnect(); }
});

before(async () => {
  for (const scenario of ['FAILURE', 'FAIL_THEN_SUCCESS', 'DISABLED']) {
    const listener = createApp({ database: db, paymentConfig: { enabled: scenario !== 'DISABLED', scenario: scenario === 'DISABLED' ? 'SUCCESS' : scenario } }).listen(0, '127.0.0.1');
    await once(listener, 'listening'); otherServers.push(listener); bases[scenario] = `http://127.0.0.1:${listener.address().port}/api`;
  }
});
async function booking(index) { const result = await reserve(index); assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.data.booking; }
const payload = (paymentMethod = 'CARD') => ({ paymentMethod, idempotencyKey: randomUUID() });
const pay = (booking, body = payload(), options = {}) => request(`/bookings/${booking.id}/payments`, { body, ...options });
const ready = id => db.payment.update({ where: { id }, data: { readyAt: new Date(Date.now() - 1) } });
async function verified(id) { const result = await request(`/payments/${id}`); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.data.payment; }
const stored = id => db.booking.findUnique({ where: { id }, include: { payments: true, ticket: true, activeSeat: true } });
const forcedProvider = { ...demoProvider, verify: payment => demoProvider.verify(payment, new Date(Date.now() + 2 * 86400000)) };

test('demo config is explicit, validates scenarios and defaults off in production', () => {
  assert.deepEqual(parsePaymentConfig({}), { enabled: true, scenario: 'SUCCESS' }); assert.equal(parsePaymentConfig({ NODE_ENV: 'production' }).enabled, false);
  assert.throws(() => parsePaymentConfig({ DEMO_PAYMENT_SCENARIO: 'PAID' })); assert.throws(() => parsePaymentConfig({ DEMO_PAYMENTS_ENABLED: 'yes' }));
});
test('passenger role, ownership and CSRF protect all payment APIs', async () => {
  const b = await booking(0);
  for (const [cookie, status] of [[null, 401], [cookies[2], 403], [cookies[3], 403]]) {
    assert.equal((await pay(b, payload(), { cookie })).status, status); assert.equal((await request(`/bookings/${b.id}/payments`, { cookie })).status, status); assert.equal((await request('/payments/missing', { cookie })).status, status);
  }
  assert.equal((await pay(b, payload(), { cookie: cookies[1] })).status, 404); assert.equal((await request(`/bookings/${b.id}/payments`, { cookie: cookies[1] })).status, 404);
  assert.equal((await pay(b, payload(), { extraHeaders: { 'X-Requested-With': '' } })).status, 403);
  const result = await pay(b); assert.equal(result.status, 201); assert.equal((await request(`/payments/${result.body.data.payment.id}`, { cookie: cookies[1] })).status, 404);
});
test('status, amount, provider outcomes and banking credentials cannot be supplied by the browser', async () => {
  const b = await booking(1);
  for (const extra of [{ status: 'PAID' }, { bookingStatus: 'CONFIRMED' }, { demoOutcome: 'SUCCESS' }, { amount: '0.01' }, { provider: 'PAYSTACK' }, { cardNumber: 'DO_NOT_STORE' }, { bankAccount: 'DO_NOT_STORE' }, { pin: 'DO_NOT_STORE' }, { qrToken: 'forged' }]) {
    const result = await pay(b, { ...payload(), ...extra }); assert.equal(result.status, 422); assert.ok(!JSON.stringify(result.body).includes('DO_NOT_STORE'));
  }
  for (const body of [{ paymentMethod: 'CASH', idempotencyKey: randomUUID() }, { paymentMethod: 'CARD', idempotencyKey: 'bad' }, { paymentMethod: 'CARD' }]) assert.equal((await pay(b, body)).status, 422);
  assert.equal(await db.payment.count({ where: { bookingId: b.id } }), 0);
});
test('initialization persists pending payment with the booking fare and no valid ticket', async () => {
  const b = await booking(2), result = await pay(b); assert.equal(result.status, 201); const p = result.body.data.payment;
  assert.equal(p.status, 'PENDING'); assert.equal(p.isDemo, true); assert.equal(p.amount, b.amount); assert.equal(result.body.data.environment, 'DEMO PAYMENT ENVIRONMENT'); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.match(p.transactionReference, /^DMP-\d{4}-[A-F0-9]{20}$/);
  const row = await stored(b.id); assert.equal(row.ticket, null); assert.equal(row.activeSeat.status, 'HELD'); assert.equal(row.bookingStatus, 'PENDING');
  assert.ok(!JSON.stringify(result.body).includes('demoOutcome')); assert.ok(!JSON.stringify(result.body).includes('idempotencyKey'));
});
for (const [index, method] of ['CARD', 'BANK_TRANSFER', 'USSD'].entries()) {
  test(`${method} success atomically confirms the booking, books its seat and creates one demo ticket`, async () => {
    const b = await booking(3 + index), requestBody = payload(method), result = await pay(b, requestBody), id = result.body.data.payment.id;
    await ready(id); assert.equal((await verified(id)).status, 'PAID');
    const row = await stored(b.id); assert.equal(row.bookingStatus, 'CONFIRMED'); assert.equal(row.paymentStatus, 'PAID'); assert.equal(row.activeSeat.status, 'BOOKED'); assert.equal(row.activeSeat.heldUntil, null); assert.equal(row.ticket.status, 'VALID'); assert.match(row.ticket.qrToken, /^[a-f0-9]{64}$/); assert.ok(row.payments[0].paidAt);
    assert.equal(row.ticket.expiresAt.getTime(), new Date(b.schedule.arrivalTime).getTime());
    const detail = await request(`/bookings/${b.id}`); assert.equal(detail.body.data.booking.ticket.isDemo, true); assert.ok(!JSON.stringify(detail.body).includes('qrToken'));
    const replay = await pay(b, requestBody); assert.equal(replay.status, 200); assert.equal(replay.body.data.payment.id, id); await verified(id);
    assert.equal(await db.payment.count({ where: { bookingId: b.id } }), 1); assert.equal(await db.ticket.count({ where: { bookingId: b.id } }), 1);
    assert.equal((await pay(b)).status, 409); assert.equal((await request(`/bookings/${b.id}/cancel`, { body: {} })).status, 409);
  });
}
test('server-selected failure marks payment failed without a ticket or extending the hold', async () => {
  const b = await booking(6), result = await pay(b, payload(), { apiBase: bases.FAILURE }), id = result.body.data.payment.id;
  await ready(id); const failure = await verified(id); assert.equal(failure.status, 'FAILED'); assert.match(failure.failureReason, /No money/);
  const row = await stored(b.id); assert.equal(row.paymentStatus, 'FAILED'); assert.equal(row.bookingStatus, 'PENDING'); assert.equal(row.activeSeat.status, 'HELD'); assert.equal(row.expiresAt.toISOString(), b.expiresAt); assert.equal(row.ticket, null); assert.equal(row.payments[0].paidAt, null);
});
test('FAIL_THEN_SUCCESS provides a repeatable failed attempt then successful retry', async () => {
  const b = await booking(7), first = (await pay(b, payload(), { apiBase: bases.FAIL_THEN_SUCCESS })).body.data.payment;
  await ready(first.id); assert.equal((await verified(first.id)).status, 'FAILED');
  const second = (await pay(b, payload('USSD'), { apiBase: bases.FAIL_THEN_SUCCESS })).body.data.payment; assert.notEqual(second.transactionReference, first.transactionReference);
  await ready(second.id); assert.equal((await verified(second.id)).status, 'PAID'); const row = await stored(b.id); assert.deepEqual(row.payments.map(p => p.status).sort(), ['FAILED', 'PAID']); assert.equal(row.ticket.status, 'VALID'); assert.equal(row.expiresAt.toISOString(), b.expiresAt);
});
test('simultaneous identical requests replay one pending intent', async () => {
  const b = await booking(8), body = payload(); const results = await Promise.all([pay(b, body), pay(b, body)]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 201]); assert.equal(results[0].body.data.payment.id, results[1].body.data.payment.id); assert.equal(await db.payment.count({ where: { bookingId: b.id } }), 1);
});
test('different simultaneous requests cannot create two pending payments or two tickets', async () => {
  const b = await booking(9), results = await Promise.all([pay(b), pay(b)]); assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
  const id = results.find(row => row.status === 201).body.data.payment.id; await ready(id); await Promise.all([verified(id), verified(id), settlePayment(db, id)]);
  assert.equal(await db.payment.count({ where: { bookingId: b.id, status: 'PAID' } }), 1); assert.equal(await db.ticket.count({ where: { bookingId: b.id } }), 1);
});
test('request keys cannot be reused across bookings or payment methods', async () => {
  const a = await booking(10), b = await booking(11), body = payload(); assert.equal((await pay(a, body)).status, 201);
  assert.equal((await pay(b, body)).status, 409); assert.equal((await pay(a, { ...body, paymentMethod: 'USSD' })).status, 409);
});
async function expire(b) {
  const deadline = new Date(Date.now() - 1000);
  await db.$transaction([db.booking.update({ where: { id: b.id }, data: { expiresAt: deadline } }), db.scheduleSeat.update({ where: { scheduleId_seatId: { scheduleId: b.schedule.id, seatId: b.seat.id } }, data: { heldUntil: deadline } })]);
}
test('failed unpaid bookings still expire and release their active seat claim', async () => {
  const b = await booking(12), p = (await pay(b, payload(), { apiBase: bases.FAILURE })).body.data.payment; await ready(p.id); await verified(p.id); await expire(b);
  const result = await request(`/bookings/${b.id}`); assert.equal(result.body.data.booking.bookingStatus, 'EXPIRED'); const row = await stored(b.id); assert.equal(row.activeScheduleSeatId, null); assert.equal(row.ticket, null); assert.equal(row.paymentStatus, 'FAILED'); assert.equal((await pay(b)).status, 409);
});
test('failed unpaid reservations remain cancellable', async () => {
  const b = await booking(13), p = (await pay(b, payload(), { apiBase: bases.FAILURE })).body.data.payment; await ready(p.id); await verified(p.id);
  assert.equal((await request(`/bookings/${b.id}/cancel`, { body: {} })).status, 200); assert.equal((await stored(b.id)).activeScheduleSeatId, null);
});
test('expiry defeats a late successful demo result and invalidates the pending payment', async () => {
  const b = await booking(14), p = (await pay(b)).body.data.payment; await expire(b); await ready(p.id);
  await Promise.all([settlePayment(db, p.id), releaseExpiredHolds(db, { scheduleId: b.schedule.id })]);
  const row = await stored(b.id); assert.equal(row.bookingStatus, 'EXPIRED'); assert.equal(row.paymentStatus, 'FAILED'); assert.equal(row.ticket, null); assert.equal(row.activeScheduleSeatId, null); assert.equal((await verified(p.id)).status, 'FAILED');
});
test('cancellation and payment settlement race to one consistent terminal state', async () => {
  const b = await booking(15), p = (await pay(b)).body.data.payment; await ready(p.id);
  const [cancelled] = await Promise.all([request(`/bookings/${b.id}/cancel`, { body: {} }), settlePayment(db, p.id)]);
  const row = await stored(b.id);
  if (row.bookingStatus === 'CANCELLED') { assert.equal(cancelled.status, 200); assert.equal(row.paymentStatus, 'FAILED'); assert.equal(row.ticket, null); assert.equal(row.activeScheduleSeatId, null); }
  else { assert.equal(row.bookingStatus, 'CONFIRMED'); assert.equal(cancelled.status, 409); assert.equal(row.paymentStatus, 'PAID'); assert.equal(row.ticket.status, 'VALID'); assert.equal(row.activeSeat.status, 'BOOKED'); }
});
test('expired, cancelled and inactive journeys cannot be paid', async () => {
  const a = await booking(16); await expire(a); assert.equal((await pay(a)).status, 409);
  const b = await booking(17); await request(`/bookings/${b.id}/cancel`, { body: {} }); assert.equal((await pay(b)).status, 409);
  const c = await booking(18); await db.train.update({ where: { id: train.id }, data: { status: 'INACTIVE' } });
  try { assert.equal((await pay(c)).status, 409); } finally { await db.train.update({ where: { id: train.id }, data: { status: 'ACTIVE' } }); }
});
test('provider reference, amount, currency and status must verify before any confirmation', async () => {
  const b = await booking(19), p = (await pay(b)).body.data.payment;
  await db.payment.update({ where: { id: p.id }, data: { readyAt: new Date(Date.now() + 86400000) } });
  for (const change of [{ transactionReference: 'forged' }, { amount: '0.01' }, { currency: 'USD' }, { status: 'CONFIRMED' }]) {
    await assert.rejects(settlePayment(db, p.id, { name: 'DEMO', verify: async payment => ({ ...(await forcedProvider.verify(payment)), ...change }) }), error => error.statusCode === 502);
  }
  const row = await stored(b.id); assert.equal(row.paymentStatus, 'PENDING'); assert.equal(row.ticket, null); assert.equal(row.activeSeat.status, 'HELD');
});
test('ticket creation failure rolls payment, booking and seat updates back together', async () => {
  const b = await booking(20), p = (await pay(b)).body.data.payment;
  await db.payment.update({ where: { id: p.id }, data: { readyAt: new Date(Date.now() + 86400000) } });
  const failure = new Error('Injected ticket storage failure');
  const failingDb = { payment: db.payment, $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, { get(target, key) { return key === 'ticket' ? { create: () => { throw failure; } } : target[key]; } })), options) };
  await assert.rejects(settlePayment(failingDb, p.id, forcedProvider), error => error === failure);
  const row = await stored(b.id); assert.equal(row.payments[0].status, 'PENDING'); assert.equal(row.payments[0].paidAt, null); assert.equal(row.bookingStatus, 'PENDING'); assert.equal(row.activeSeat.status, 'HELD'); assert.equal(row.ticket, null);
});
test('the backend worker completes a durable demo intent without frontend confirmation', async () => {
  const b = await booking(21), p = (await pay(b)).body.data.payment; await ready(p.id);
  const stop = startPaymentWorker(() => db, { enabled: true }, 20);
  try { for (let i = 0; i < 100; i++) { if ((await stored(b.id)).bookingStatus === 'CONFIRMED') break; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal((await stored(b.id)).bookingStatus, 'CONFIRMED');
  } finally { await stop(); }
});
test('disabled demo environment rejects new payment attempts', async () => {
  const b = await booking(22); assert.equal((await pay(b, payload(), { apiBase: bases.DISABLED })).status, 503); assert.equal(await db.payment.count({ where: { bookingId: b.id } }), 0);
});
test('all paid attempts have unique references and ticket tokens; failures have no issued ticket', async () => {
  const rows = await db.payment.findMany({ where: { booking: { userId: users[0].id } } }); assert.equal(new Set(rows.map(p => p.transactionReference)).size, rows.length);
  const tickets = await db.ticket.findMany({ where: { booking: { userId: users[0].id } } }); assert.equal(new Set(tickets.map(t => t.qrToken)).size, tickets.length);
  for (const ticket of tickets) assert.ok(rows.some(p => p.bookingId === ticket.bookingId && p.status === 'PAID'));
});
