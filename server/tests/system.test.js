import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { systemFixture } from './helpers/system-fixture.js';
import { railwayDate } from '../src/services/search.service.js';
import { settlePayment } from '../src/payments/payment.service.js';
import { reviewAlert } from '../src/monitoring/investigation.service.js';
import { monitoringReport } from '../src/monitoring/reporting.service.js';

let f, booking, ticket, token, alert, verification;
before(async () => { f = await systemFixture(); });
after(async () => { if (f) await f.cleanup(); });

test('full passenger journey: registration, logout, login, real search and explainable recommendation', async () => {
  const registration = await f.request('/auth/register', { role: '', body: { fullName: `${f.tag} Passenger`, email: `passenger@${f.tag}.test`, phone: `080${Date.now().toString().slice(-8)}`, password: f.password, confirmPassword: f.password } });
  assert.equal(registration.status, 201, registration.body.message); assert.ok(!JSON.stringify(registration.body).includes('passwordHash'));
  f.users.push(registration.body.data.user); f.cookies.PASSENGER = registration.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/auth/logout', { role: 'PASSENGER', body: {} })).status, 200); await f.login('PASSENGER');
  const query = new URLSearchParams({ originId: f.stations[0].id, destinationId: f.stations[1].id, date: railwayDate(new Date(f.schedules[0].departureTime)), preference: 'BEST_OVERALL' });
  const result = await f.request(`/schedules/search?${query}`, { role: 'PASSENGER' });
  assert.equal(result.status, 200, result.body.message); assert.equal(result.body.data.items[0].id, f.schedules[0].id);
  assert.ok(result.body.data.items[0].recommendation); assert.equal(result.body.data.items[0].availableSeats, 8);
});
test('passenger selects available seat and creates a pending reservation', async () => {
  const inventory = await f.request(`/schedules/${f.schedules[0].id}/seats`, { role: 'PASSENGER' }); assert.equal(inventory.status, 200);
  const result = await f.request('/bookings', { role: 'PASSENGER', body: { scheduleId: f.schedules[0].id, seatId: f.seats[0].id, expectedAmount: '2500.50' } });
  assert.equal(result.status, 201, result.body.message); booking = result.body.data.booking;
  assert.equal(booking.bookingStatus, 'PENDING'); assert.equal(await f.db.ticket.count({ where: { bookingId: booking.id } }), 0);
});
test('demo payment succeeds on server; generated ticket QR contains only the verification token', async () => {
  const result = await f.request(`/bookings/${booking.id}/payments`, { role: 'PASSENGER', body: { paymentMethod: 'CARD', idempotencyKey: randomUUID() } });
  assert.equal(result.status, 201, result.body.message);
  await f.db.payment.update({ where: { id: result.body.data.payment.id }, data: { readyAt: new Date(Date.now() - 1000) } }); await settlePayment(f.db, result.body.data.payment.id);
  ticket = await f.db.ticket.findUnique({ where: { bookingId: booking.id } }); assert.equal(ticket.status, 'VALID');
  const detail = await f.request(`/tickets/${ticket.id}`, { role: 'PASSENGER' }); assert.equal(detail.status, 200);
  const text = JSON.stringify(detail.body); assert.ok(!text.includes('passwordHash')); assert.ok(!text.includes('qrToken'));
  const dataUrl = text.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)?.[1]; assert.ok(dataUrl, 'Ticket includes QR image');
  const png = PNG.sync.read(Buffer.from(dataUrl, 'base64')); token = jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data;
  assert.equal(token, ticket.qrToken); assert.match(token, /^[a-f0-9]{64}$/);
});
test('officer verifies decoded QR, confirms boarding and repeat use creates scan plus HIGH alert', async () => {
  await f.login('TICKET_OFFICER');
  const checked = await f.request('/officer/verify', { role: 'TICKET_OFFICER', body: { entry: token, scheduleId: f.schedules[0].id } });
  assert.equal(checked.body.data.status, 'VALID'); verification = checked.body.data.verificationId;
  const boarded = await f.request('/officer/board', { role: 'TICKET_OFFICER', body: { verificationId: verification } }); assert.equal(boarded.body.data.status, 'BOARDED');
  const repeat = await f.request('/officer/verify', { role: 'TICKET_OFFICER', body: { entry: token, scheduleId: f.schedules[0].id } });
  assert.equal(repeat.body.data.status, 'ALREADY_USED'); assert.equal(repeat.body.data.valid, false); assert.equal(repeat.body.data.usedAt, boarded.body.data.usedAt);
  assert.equal(await f.db.ticketScanLog.count({ where: { ticketId: ticket.id, result: 'ALREADY_USED' } }), 1);
  alert = await f.db.fraudAlert.findFirst({ where: { ticketId: ticket.id, type: 'DUPLICATE_TICKET_USE' } }); assert.equal(alert.severity, 'HIGH');
});
test('admin views bookings and payments with correct filtering and no bearer credentials', async () => {
  await f.login('ADMIN');
  for (const resource of ['bookings', 'payments']) {
    const result = await f.request(`/admin/${resource}?q=${booking.bookingReference}&pageSize=1`); assert.equal(result.status, 200, result.body.message);
    assert.equal(result.body.data.total, 1); assert.equal(result.body.data.items[0].amount, '2500.50');
    for (const field of ['passwordHash', 'qrToken', 'idempotencyKey', 'email', 'phone']) assert.ok(!JSON.stringify(result.body).includes(`"${field}"`));
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await f.request(`/admin/payments?q=${booking.bookingReference}&status=FAILED`)).body.data.total, 0);
});
test('admin report uses real totals, paid revenue, distinct verified tickets and zero-filled daily series', async () => {
  const result = await f.request(`/admin/monitoring?from=${railwayDate()}&to=${railwayDate()}`); assert.equal(result.status, 200, result.body.message);
  const report = result.body.data;
  assert.equal(report.counts.totalBookings, await f.db.booking.count()); assert.equal(report.counts.ticketsIssued, await f.db.ticket.count());
  assert.equal(report.daily.length, 1); assert.ok(Number(report.daily[0].revenue) >= 2500.5);
  assert.equal(report.popularRoutes.find(route => route.id === f.route.id).bookings, 1);
  assert.equal(report.bookingStatuses.reduce((sum, row) => sum + row.count, 0), report.daily[0].bookings);
  const empty = await f.request('/admin/monitoring?from=2000-01-01&to=2000-01-03'); assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data.daily.map(row => [row.bookings, row.revenue]), [[0, '0.00'], [0, '0.00'], [0, '0.00']]);
});
test('admin investigates a ticket, reviews and resolves an alert with preserved history', async () => {
  const detail = await f.request(`/admin/fraud-alerts/${alert.id}`); assert.equal(detail.status, 200);
  assert.equal(detail.body.data.subject.role, 'PASSENGER'); assert.equal(detail.body.data.scans.length, 3); assert.equal(detail.body.data.recentBookings.length, 1);
  const investigated = await f.request(`/admin/fraud-alerts/${alert.id}/investigate-ticket`, { body: { note: 'Checked ticket against original boarding evidence.' } }); assert.equal(investigated.status, 200);
  const review = await f.request(`/admin/fraud-alerts/${alert.id}/review`, { body: { status: 'UNDER_REVIEW', note: 'Reviewing duplicate presentation with officer.', expectedUpdatedAt: detail.body.data.alert.updatedAt } }); assert.equal(review.status, 200);
  const resolved = await f.request(`/admin/fraud-alerts/${alert.id}/review`, { body: { status: 'RESOLVED', note: 'Officer confirmed an accidental repeat scan.', expectedUpdatedAt: review.body.data.alert.updatedAt } }); assert.equal(resolved.status, 200);
  const final = await f.request(`/admin/fraud-alerts/${alert.id}`); assert.equal(final.body.data.alert.status, 'RESOLVED'); assert.equal(final.body.data.reviewHistoryTotal, 2);
  assert.equal((await f.db.ticket.findUnique({ where: { id: ticket.id } })).status, 'USED');
});
test('simultaneous alert decisions have one winner and one conflict without lost history', async () => {
  const current = (await f.request(`/admin/fraud-alerts/${alert.id}`)).body.data.alert;
  const results = await Promise.all(['DISMISSED', 'UNDER_REVIEW'].map(status => f.request(`/admin/fraud-alerts/${alert.id}/review`, { body: { status, note: 'Concurrent administrative decision for testing.', expectedUpdatedAt: current.updatedAt } })));
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  assert.equal((await f.request(`/admin/fraud-alerts/${alert.id}`)).body.data.reviewHistoryTotal, 3);
});
test('audit-write failure rolls back an alert review', async () => {
  const current = await f.db.fraudAlert.findUnique({ where: { id: alert.id } }), failure = new Error('Injected audit failure');
  const failing = { $transaction: (work, options) => f.db.$transaction(tx => work(new Proxy(tx, { get(target, key) { return key === 'auditLog' ? { create() { throw failure; } } : target[key]; } })), options) };
  await assert.rejects(reviewAlert(failing, alert.id, f.users[0].id, { status: 'RESOLVED', note: 'Decision must roll back if its audit cannot be stored.', expectedUpdatedAt: current.updatedAt.toISOString() }), error => error === failure);
  assert.deepEqual(await f.db.fraudAlert.findUnique({ where: { id: alert.id } }), current);
});
test('new admin endpoints and decisions enforce roles, CSRF and strict input', async () => {
  for (const role of ['', 'PASSENGER', 'TICKET_OFFICER']) for (const path of ['/admin/monitoring', '/admin/bookings', '/admin/payments', '/admin/audit-logs', `/admin/fraud-alerts/${alert.id}`]) {
    assert.equal((await f.request(path, { role })).status, role ? 403 : 401);
  }
  for (const role of ['', 'PASSENGER', 'TICKET_OFFICER']) assert.equal((await f.request(`/admin/fraud-alerts/${alert.id}/review`, { role, body: {} })).status, role ? 403 : 401);
  assert.equal((await f.request(`/admin/fraud-alerts/${alert.id}/review`, { body: {}, extraHeaders: { 'X-Requested-With': '' } })).status, 403);
  for (const path of ['/admin/monitoring?from=2026-02-30', '/admin/monitoring?from=2026-01-01&to=2026-12-31', '/admin/monitoring?from=2026-09-20&to=2026-09-19', '/admin/bookings?status=PAID', '/admin/payments?pageSize=999', '/admin/audit-logs?extra=x']) assert.equal((await f.request(path)).status, 422, path);
  assert.equal((await f.request(`/admin/fraud-alerts/${alert.id}/review`, { body: { status: 'RESOLVED', score: 0 } })).status, 422);
});
test('audit history contains login, CRUD, investigation and review events; sensitive evidence is redacted', async () => {
  const marker = 'a'.repeat(64), current = await f.db.fraudAlert.findUnique({ where: { id: alert.id } });
  const status = current.status === 'DISMISSED' ? 'UNDER_REVIEW' : 'DISMISSED';
  await f.request(`/admin/fraud-alerts/${alert.id}/review`, { body: { status, note: `Reviewed scanned token ${marker} password=hidden`, expectedUpdatedAt: current.updatedAt.toISOString() } });
  const records = await f.request(`/admin/audit-logs?actorId=${f.users[0].id}&pageSize=50`); assert.equal(records.status, 200);
  const actions = records.body.data.items.map(row => row.action);
  for (const action of ['ADMIN_LOGIN', 'ADMIN_CREATE_TRAIN', 'FRAUD_ALERT_REVIEWED', 'TICKET_MANUALLY_INVESTIGATED']) assert.ok(actions.includes(action), action);
  const stored = await f.db.auditLog.findMany({ where: { entityId: alert.id } }); assert.ok(!JSON.stringify(stored).includes(marker)); assert.ok(!JSON.stringify(stored).includes('hidden'));
});
test('manual passenger suspension revokes sessions, preserves bookings, and reactivation requires fresh login', async () => {
  const user = f.users.find(row => row.role === 'PASSENGER');
  assert.equal((await f.request(`/admin/passengers/${user.id}/status`, { body: { status: 'SUSPENDED', expectedStatus: 'ACTIVE', note: 'Temporary manual test suspension pending investigation.' } })).status, 200);
  assert.equal((await f.request('/auth/me', { role: 'PASSENGER' })).status, 401); assert.equal(await f.db.booking.count({ where: { userId: user.id } }), 1);
  assert.equal((await f.request(`/admin/passengers/${user.id}/status`, { body: { status: 'ACTIVE', expectedStatus: 'SUSPENDED', note: 'Review complete and account access restored.' } })).status, 200);
  assert.equal((await f.request('/auth/me', { role: 'PASSENGER' })).status, 401); await f.login('PASSENGER');
  assert.equal((await f.request(`/admin/passengers/${f.users[0].id}/status`, { body: { status: 'SUSPENDED', expectedStatus: 'ACTIVE', note: 'Must not suspend administrator through passenger API.' } })).status, 404);
});
test('report day boundaries follow WAT rather than UTC and exclude pending or failed revenue', async () => {
  const original = await f.db.booking.findUnique({ where: { id: booking.id } });
  const payment = await f.db.payment.findFirst({ where: { bookingId: booking.id, status: 'PAID' } });
  try {
    for (const status of ['PENDING', 'FAILED', 'REFUNDED']) await f.db.payment.create({ data: { bookingId: booking.id, transactionReference: `${f.tag}-${status}`, amount: '2500.50', currency: 'NGN', status, paymentMethod: 'CARD', isDemo: true,
      createdAt: new Date('2001-01-01T23:30:00Z'), paidAt: status === 'REFUNDED' ? new Date('2001-01-01T23:30:00Z') : null } });
    await f.db.booking.update({ where: { id: booking.id }, data: { createdAt: new Date('2001-01-01T23:30:00Z') } });
    await f.db.payment.update({ where: { id: payment.id }, data: { paidAt: new Date('2001-01-01T23:30:00Z') } });
    const report = await monitoringReport(f.db, { from: '2001-01-01', to: '2001-01-03' }, new Date('2001-01-02T01:00:00Z'));
    assert.deepEqual(report.daily.map(row => [row.bookings, row.revenue]), [[0, '0.00'], [1, '2500.50'], [0, '0.00']]); assert.equal(report.counts.todaysBookings, 1);
  } finally {
    await f.db.booking.update({ where: { id: booking.id }, data: { createdAt: original.createdAt } });
    await f.db.payment.update({ where: { id: payment.id }, data: { paidAt: payment.paidAt } });
  }
});
