import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseAuthConfig } from '../src/config/auth.js';
import { signSession } from '../src/security/tokens.js';
import { env } from '../src/config/env.js';
import { initializePayment, settlePayment } from '../src/payments/payment.service.js';
import { confirmBoarding, verifyForBoarding } from '../src/officer/officer.service.js';
import { assessActivity, activityMetrics, fraudTransaction, recordBookingAttempt } from '../src/fraud/fraud.service.js';
import { cancelPendingBooking, createPendingBooking, releaseExpiredHolds } from '../src/services/booking.service.js';
import { railwayDate } from '../src/services/search.service.js';


if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('Fraud tests require ALLOW_DB_TESTS=true and a non-production database.');
const db = createDatabaseClient(), tag = randomBytes(5).toString('hex'), config = parseAuthConfig();
const users = [], cookies = [], stations = [], schedules = [], seats = [];
let nextSeat = 0;
let train, route, server, base;
const headers = { Origin: env.clientUrls[0], 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
async function request(path, { cookie = cookies[0], body, method = body ? 'POST' : 'GET', extraHeaders = {}, apiBase = base } = {}) {
  const response = await fetch(`${apiBase}${path}`, { method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const input = (index, schedule = schedules[0]) => ({ scheduleId: schedule.id, seatId: seats[index].id, expectedAmount: seats[index].seatClass === 'ECONOMY' ? '2500.00' : '5000.00' });
const reserve = (index, options = {}) => request('/bookings', { body: input(index), ...options });
before(async () => {
  for (const [index, role] of ['PASSENGER', 'PASSENGER', 'ADMIN', 'TICKET_OFFICER', 'TICKET_OFFICER'].entries()) {
    const user = await db.user.create({ data: { fullName: `Ọlá Adéyẹmí ${index}`, email: `${index}@ticket-${tag}.test`, phone: `+8${index}${BigInt(`0x${tag}`)}`, passwordHash: 'unused-test-hash', role } }); users.push(user);
    const session = await db.authSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) } }); cookies.push(`${config.cookieName}=${signSession(session, config)}`);
  }
  for (const suffix of ['A', 'B']) stations.push(await db.station.create({ data: { name: `Booking ${tag} ${suffix}`, code: `${tag}-${suffix}`, city: 'Test', state: 'Test' } }));
  route = await db.route.create({ data: { originStationId: stations[0].id, destinationStationId: stations[1].id, distanceKm: '100', estimatedDuration: 90 } });
  train = await db.train.create({ data: { name: `Booking ${tag}`, code: tag, capacity: 60 } });
  for (let i = 0; i < 60; i++) seats.push(await db.seat.create({ data: { trainId: train.id, seatNumber: `S${i + 1}`, seatClass: i === 1 ? 'BUSINESS' : 'ECONOMY', status: 'ACTIVE' } }));
  for (let i = 0; i < 2; i++) {
    const departureTime = new Date(Date.now() + (10 + i) * 86400000);
    const schedule = await db.schedule.create({ data: { trainId: train.id, routeId: route.id, departureTime, arrivalTime: new Date(departureTime.getTime() + 5400000), fareEconomy: '2500', fareBusiness: '5000' } }); schedules.push(schedule);
    await db.scheduleSeat.createMany({ data: seats.map(seat => ({ trainId: train.id, seatId: seat.id, scheduleId: schedule.id, status: seat.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED' })) });
  }
  server = createApp({ database: db, paymentConfig: { enabled: true, scenario: 'SUCCESS' } }).listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  try { await db.$transaction(async tx => {
    const bookings = await tx.booking.findMany({ where: { userId: { in: users.map(row => row.id) } }, select: { id: true } });
    const paymentIds = (await tx.payment.findMany({ where: { bookingId: { in: bookings.map(row => row.id) } }, select: { id: true } })).map(row => row.id);
    const ticketIds = (await tx.ticket.findMany({ where: { bookingId: { in: bookings.map(row => row.id) } }, select: { id: true } })).map(row => row.id);
    await tx.fraudAlert.deleteMany({ where: { userId: { in: users.map(row => row.id) } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ entityType: 'Payment', entityId: { in: paymentIds } }, { entityType: 'Ticket', entityId: { in: ticketIds } }] } });
    await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: users.map(row => row.id) } }, { entityType: 'Booking', entityId: { in: bookings.map(row => row.id) } }] } });
    await tx.ticketScanLog.deleteMany({ where: { officerId: { in: users.map(row => row.id) } } });
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

async function reserveNext() {
  const result = await reserve(nextSeat++); assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.data.booking;
}
async function payBooking(b, outcome = 'SUCCESS') {
  const result = await request(`/bookings/${b.id}/payments`, { body: { paymentMethod: 'CARD', idempotencyKey: randomUUID() } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const p = result.body.data.payment;
  await db.payment.update({ where: { id: p.id }, data: { demoOutcome: outcome, readyAt: new Date(Date.now() - 1000) } });
  await settlePayment(db, p.id);
  return db.ticket.findUnique({ where: { bookingId: b.id } });
}
async function paidTicket() { return payBooking(await reserveNext()); }

const verify = (rowOrEntry, options = {}) => request('/officer/verify', { cookie: cookies[3], body: { entry: typeof rowOrEntry === 'string' ? rowOrEntry : rowOrEntry.qrToken, scheduleId: schedules[0].id }, ...options });
const board = (verificationId, options = {}) => request('/officer/board', { cookie: cookies[3], body: { verificationId }, ...options });
async function validCheck(row, options) { const result = await verify(row, options); assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.data.status, 'VALID'); return result.body.data; }

async function actor(role = 'PASSENGER') {
  const n=users.length, user=await db.user.create({data:{fullName:`Monitor fixture ${n}`,email:`${n}@fraud-${tag}.test`,phone:`+8${n}${BigInt(`0x${tag}`)}`,passwordHash:'unused-test-hash',role}});
  const session=await db.authSession.create({data:{userId:user.id,expiresAt:new Date(Date.now()+3600000)}});
  users.push(user); const cookie=`${config.cookieName}=${signSession(session,config)}`;cookies.push(cookie); return {...user,cookie};
}
async function reservation(user) {return (await createPendingBooking(db,user.id,input(nextSeat++))).booking;}
const alerts=(userId,type)=>db.fraudAlert.findMany({where:{userId,...(type?{type}:{})},orderBy:{createdAt:'asc'}});
const attempt=user=>request('/bookings',{cookie:user.cookie,body:{}});
const scan=(user,entry='unrecognized QR content')=>request('/officer/verify',{cookie:user.cookie,body:{entry,scheduleId:schedules[0].id}});

test('admin-only alert endpoints protect list, detail and live scores; no mutation API exists',async()=>{
  for(const [cookie,expected] of [[null,401],[cookies[0],403],[cookies[3],403]]) for(const path of ['/admin/fraud-alerts','/admin/fraud-alerts/missing',`/admin/fraud-alerts/activity/${users[0].id}`]) assert.equal((await request(path,{cookie})).status,expected);
  assert.equal((await request('/admin/fraud-alerts',{cookie:cookies[2],body:{score:100}})).status,404);
  assert.equal((await request('/admin/fraud-alerts?severity=GUILTY',{cookie:cookies[2]})).status,422);
  assert.equal((await request('/admin/fraud-alerts/missing',{cookie:cookies[2]})).status,404);
  assert.equal((await request('/admin/fraud-alerts/activity/missing',{cookie:cookies[2]})).status,404);
});

test('ninth authenticated booking attempt alerts even when every request is rejected',async()=>{
  const user=await actor();
  for(let i=0;i<8;i++) assert.equal((await attempt(user)).status,422);
  assert.equal((await alerts(user.id,'EXCESSIVE_BOOKING_ATTEMPTS')).length,0);
  assert.equal((await attempt(user)).status,422);
  const [alert]=await alerts(user.id,'EXCESSIVE_BOOKING_ATTEMPTS');assert.equal(alert.severity,'MEDIUM');assert.equal(alert.score,40);assert.equal(alert.features.metrics.bookingsLast10Minutes,9);
  assert.equal(await db.booking.count({where:{userId:user.id}}),0);assert.equal((await db.user.findUnique({where:{id:user.id}})).status,'ACTIVE');
  assert.equal((await request('/bookings',{cookie:user.cookie,body:{},extraHeaders:{'X-Requested-With':''}})).status,403);
  assert.equal(await db.auditLog.count({where:{userId:user.id,action:'BOOKING_ATTEMPT'}}),9);
});

test('concurrent booking attempts count once each and cannot create duplicate threshold alerts',async()=>{
  const user=await actor(),results=await Promise.all(Array.from({length:9},()=>attempt(user)));
  assert.ok(results.every(r=>r.status===422),JSON.stringify(results));assert.equal(await db.auditLog.count({where:{userId:user.id,action:'BOOKING_ATTEMPT'}}),9);
  assert.equal((await alerts(user.id,'EXCESSIVE_BOOKING_ATTEMPTS')).length,1);
});

test('rolling windows exclude boundary, older and future events',async()=>{
  const user=await actor(),now=new Date();
  await db.auditLog.createMany({data:[-600001,-600000,-599999,0,1].map(offset=>({userId:user.id,action:'BOOKING_ATTEMPT',entityType:'User',createdAt:new Date(now.getTime()+offset)}))});
  await db.auditLog.createMany({data:[-1800001,-1800000,-1799999,0,1].map(offset=>({userId:user.id,action:'DEMO_PAYMENT_DECLINED',entityType:'Payment',createdAt:new Date(now.getTime()+offset)}))});
  const metrics=await activityMetrics(db,user.id,now);assert.equal(metrics.bookingsLast10Minutes,2);assert.equal(metrics.paymentFailuresLast30Minutes,2);
});

test('five invalid scans create a contextual officer alert, including malformed QR contents',async()=>{
  const officer=await actor('TICKET_OFFICER'),secretEntry='https://untrusted.test/private-test-marker';
  for(let i=0;i<4;i++) assert.equal((await scan(officer,secretEntry)).body.data.status,'INVALID');
  assert.equal((await alerts(officer.id,'REPEATED_INVALID_SCANS')).length,0);
  assert.equal((await scan(officer)).body.data.status,'INVALID');
  const [alert]=await alerts(officer.id,'REPEATED_INVALID_SCANS');assert.equal(alert.ticketId,null);assert.equal(alert.features.subjectScope,'OFFICER_SCAN_ACTIVITY');assert.equal(alert.features.metrics.invalidScansLast10Minutes,5);
  assert.ok(!JSON.stringify(await alerts(officer.id)).includes(secretEntry));assert.ok(!JSON.stringify(await alerts(officer.id)).includes('private-test-marker'));
  const [anomaly]=await alerts(officer.id,'ANOMALY_SCORE');assert.equal(anomaly.score,35);assert.equal(anomaly.severity,'MEDIUM');assert.equal(anomaly.features.contributions.find(c=>c.factor==='invalidScansLast10Minutes').points,35);
  await scan(officer);assert.equal((await alerts(officer.id,'REPEATED_INVALID_SCANS')).length,1);assert.equal((await alerts(officer.id,'ANOMALY_SCORE')).length,1);
});

test('invalid-scan counts remain separate across officers; concurrent scans cross the threshold once',async()=>{
  const a=await actor('TICKET_OFFICER'),b=await actor('TICKET_OFFICER');
  await Promise.all([scan(a),scan(a),scan(a),scan(b),scan(b),scan(b)]);
  assert.equal((await alerts(a.id,'REPEATED_INVALID_SCANS')).length,0);assert.equal((await alerts(b.id,'REPEATED_INVALID_SCANS')).length,0);
  const results=await Promise.all([scan(a),scan(a)]);assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal((await alerts(a.id,'REPEATED_INVALID_SCANS')).length,1);
});

test('every duplicate ticket rejection atomically creates a HIGH rule alert without changing usedAt',async()=>{
  const row=await paidTicket(),v=await validCheck(row),first=await board(v.verificationId);
  for(const result of [await verify(row),await board(v.verificationId)]) {assert.equal(result.body.data.status,'ALREADY_USED');assert.equal(result.body.data.usedAt,first.body.data.usedAt);}
  const rows=await db.fraudAlert.findMany({where:{ticketId:row.id,type:'DUPLICATE_TICKET_USE'}});assert.equal(rows.length,2);
  for(const alert of rows) {assert.equal(alert.severity,'HIGH');assert.equal(alert.score,60);assert.equal(alert.userId,users[0].id);assert.equal(alert.bookingId,row.bookingId);assert.equal(alert.features.officerId,users[3].id);assert.ok(!JSON.stringify(alert).includes(row.qrToken));}
  const scanRow=await db.ticketScanLog.findFirst({where:{ticketId:row.id,result:'ALREADY_USED'}});
  await fraudTransaction(db,tx=>assessActivity(tx,{userId:users[0].id,sourceId:scanRow.id,sourceType:'DUPLICATE_SCAN',ticketId:row.id,bookingId:row.bookingId,officerId:users[3].id,duplicateEvent:true}));
  assert.equal(await db.fraudAlert.count({where:{ticketId:row.id,type:'DUPLICATE_TICKET_USE'}}),2);
});

test('three provider-declined demo payments alert once; settlement replay does not inflate the count',async()=>{
  const user=await actor(),b=await reservation(user);
  for(let i=0;i<3;i++) {
    const intent=await initializePayment(db,user.id,b.id,{paymentMethod:'CARD',idempotencyKey:randomUUID()},{enabled:true,scenario:'FAILURE'});
    await db.payment.update({where:{id:intent.payment.id},data:{readyAt:new Date(Date.now()-1)}});await settlePayment(db,intent.payment.id);await settlePayment(db,intent.payment.id);
    if(i<2) assert.equal((await alerts(user.id,'REPEATED_PAYMENT_FAILURES')).length,0);
  }
  const [alert]=await alerts(user.id,'REPEATED_PAYMENT_FAILURES');assert.equal(alert.features.metrics.paymentFailuresLast30Minutes,3);assert.match(alert.description,/simulator/);assert.equal(alert.bookingId,b.id);
  assert.equal(await db.auditLog.count({where:{userId:user.id,action:'DEMO_PAYMENT_DECLINED'}}),3);assert.equal(await db.ticket.count({where:{bookingId:b.id}}),0);
});

test('hold expiry and cancellation failures are not miscounted as provider declines',async()=>{
  const user=await actor(),b=await reservation(user);
  const intent=await initializePayment(db,user.id,b.id,{paymentMethod:'USSD',idempotencyKey:randomUUID()},{enabled:true,scenario:'SUCCESS'});
  await cancelPendingBooking(db,user.id,b.id);await settlePayment(db,intent.payment.id);
  const metrics=await activityMetrics(db,user.id,new Date());assert.equal(metrics.paymentFailuresLast30Minutes,0);assert.equal((await alerts(user.id,'REPEATED_PAYMENT_FAILURES')).length,0);
});

test('high cancellation alert needs ten bookings and at least sixty percent voluntary cancellations',async()=>{
  const user=await actor(),cohort=[];for(let i=0;i<10;i++) cohort.push(await reservation(user));
  for(let i=0;i<5;i++) await cancelPendingBooking(db,user.id,cohort[i].id);
  assert.equal((await alerts(user.id,'HIGH_CANCELLATION_RATE')).length,0);
  await cancelPendingBooking(db,user.id,cohort[5].id);
  const [alert]=await alerts(user.id,'HIGH_CANCELLATION_RATE');assert.equal(alert.features.metrics.cancellationRate,0.6);assert.equal(alert.features.metrics.bookingsLast24Hours,10);
  await cancelPendingBooking(db,user.id,cohort[5].id);assert.equal((await alerts(user.id,'HIGH_CANCELLATION_RATE')).length,1);
});

test('automatic expiry does not contribute to voluntary cancellation rate',async()=>{
  const user=await actor(),b=await reservation(user),deadline=new Date(Date.now()-1000);
  const stored=await db.booking.findUnique({where:{id:b.id}});
  await db.$transaction([db.booking.update({where:{id:b.id},data:{expiresAt:deadline}}),db.scheduleSeat.update({where:{id:stored.scheduleSeatId},data:{heldUntil:deadline}})]);
  await releaseExpiredHolds(db,{activeBooking:{is:{userId:user.id}}});
  const metrics=await activityMetrics(db,user.id,new Date());assert.equal(metrics.cancellationsLast24Hours,0);assert.equal((await db.booking.findUnique({where:{id:b.id}})).bookingStatus,'EXPIRED');
});

test('cooldown suppresses repeated threshold alerts, but a later episode can alert again',async()=>{
  const user=await actor();for(let i=0;i<10;i++) await recordBookingAttempt(db,user.id);
  const [first]=await alerts(user.id,'EXCESSIVE_BOOKING_ATTEMPTS');assert.ok(first);assert.equal((await alerts(user.id,'EXCESSIVE_BOOKING_ATTEMPTS')).length,1);
  await db.fraudAlert.update({where:{id:first.id},data:{createdAt:new Date(Date.now()-601000)}});
  await recordBookingAttempt(db,user.id);assert.equal((await alerts(user.id,'EXCESSIVE_BOOKING_ATTEMPTS')).length,2);
});

test('a HIGH anomaly snapshot stores a reproducible score and contributing factors',async()=>{
  const user=await actor(),cohort=[];for(let i=0;i<10;i++) cohort.push(await reservation(user));
  for(let i=0;i<6;i++) await cancelPendingBooking(db,user.id,cohort[i].id);
  await db.auditLog.createMany({data:[...Array.from({length:12},()=>({userId:user.id,action:'BOOKING_ATTEMPT',entityType:'User'})),...Array.from({length:3},()=>({userId:user.id,action:'DEMO_PAYMENT_DECLINED',entityType:'Payment'}))]});
  const event=await db.auditLog.create({data:{userId:user.id,action:'TEST_ASSESSMENT',entityType:'User'}});
  await fraudTransaction(db,tx=>assessActivity(tx,{userId:user.id,sourceId:event.id,sourceType:'BOOKING_ATTEMPT'}));
  const [alert]=await alerts(user.id,'ANOMALY_SCORE');assert.equal(alert.score,65);assert.equal(alert.severity,'HIGH');assert.equal(alert.features.rawScore,65);assert.equal(alert.features.contributions.reduce((sum,c)=>sum+c.points,0),65);
  assert.match(alert.description,/requires review/);assert.equal(alert.status,'NEW');assert.equal((await db.user.findUnique({where:{id:user.id}})).status,'ACTIVE');
});

test('alert storage failure rolls back a duplicate scan and keeps original ticket usage unchanged',async()=>{
  const row=await paidTicket(),v=await validCheck(row);await board(v.verificationId);
  const previous=await db.ticket.findUnique({where:{id:row.id}}),count=await db.ticketScanLog.count({where:{ticketId:row.id}}),failure=new Error('Injected alert write failure');
  const failing={ $transaction:(work,options)=>db.$transaction(tx=>work(new Proxy(tx,{get(target,key){return key==='fraudAlert'?new Proxy(target.fraudAlert,{get(model,field){return field==='upsert'?()=>{throw failure;}:model[field];}}):target[key];}})),options)};
  await assert.rejects(verifyForBoarding(failing,users[3].id,{entry:row.qrToken,scheduleId:schedules[0].id},'127.0.0.1'),error=>error===failure);
  assert.equal(await db.ticketScanLog.count({where:{ticketId:row.id}}),count);assert.deepEqual(await db.ticket.findUnique({where:{id:row.id}}),previous);
});

test('admin can inspect filtered alerts and live LOW scores without accessing credentials or mutating flags',async()=>{
  const result=await request('/admin/fraud-alerts?type=DUPLICATE_TICKET_USE&severity=HIGH&pageSize=1',{cookie:cookies[2]});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.body.data.items.length,1);
  const detail=await request(`/admin/fraud-alerts/${result.body.data.items[0].id}`,{cookie:cookies[2]});assert.ok(detail.body.data.alert.features.contributions.length);
  for(const secret of ['passwordHash','qrToken','tokenFingerprint']) assert.ok(!JSON.stringify(detail.body).includes(secret));
  const clean=await actor(),score=await request(`/admin/fraud-alerts/activity/${clean.id}`,{cookie:cookies[2]});assert.equal(score.body.data.score,0);assert.equal(score.body.data.severity,'LOW');assert.equal((await alerts(clean.id)).length,0);
});
