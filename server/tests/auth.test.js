import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseAuthConfig } from '../src/config/auth.js';
import { env } from '../src/config/env.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') {
  throw new Error('Authentication integration tests require ALLOW_DB_TESTS=true and a non-production database.');
}
const db = createDatabaseClient();
const config = parseAuthConfig();
const tag = randomBytes(6).toString('hex');
const suffix = `@auth-${tag}.test`;
const password = `Auth!${randomBytes(16).toString('hex')}Z9`;
const headers = { Origin: env.clientUrls[0], 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
let server, base, registered;
const users = {};
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0];

before(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [index, role] of ['PASSENGER', 'ADMIN', 'TICKET_OFFICER'].entries()) {
    users[role] = await db.user.create({ data: { fullName: `Auth test ${role}`, email: `${role.toLowerCase()}${suffix}`, phone: `+9${index}${Date.now().toString().slice(-10)}`, passwordHash, role } });
  }
  server = createApp({ database: db, authRateLimits: { loginLimit: 100, registrationLimit: 100 } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  try {
    const rows = await db.user.findMany({ where: { email: { endsWith: suffix } }, select: { id: true } });
    const ids = rows.map(row => row.id);
    await db.$transaction([
      db.authSession.deleteMany({ where: { userId: { in: ids } } }),
      db.auditLog.deleteMany({ where: { userId: { in: ids } } }),
      db.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
  } finally { await db.$disconnect(); }
});

async function request(path, { body, cookie, method, extraHeaders = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'), headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
}
async function signIn(role = 'PASSENGER') {
  const result = await request('/auth/login', { body: { email: users[role].email, password } });
  assert.equal(result.response.status, 200);
  return { ...result, cookie: cookieOf(result.response) };
}
const registration = () => ({ fullName: 'Registered Passenger', email: `registered${suffix}`, phone: `080${Date.now().toString().slice(-8)}`, password, confirmPassword: password });

test('registration creates a passenger, hashes the password, and sets an HttpOnly session cookie', async () => {
  registered = registration();
  const { response, body } = await request('/auth/register', { body: registered });
  assert.equal(response.status, 201);
  assert.equal(body.data.user.role, 'PASSENGER');
  assert.equal(body.data.user.status, 'ACTIVE');
  assert.equal(body.data.user.isDemo, false);
  assert.equal(body.data.user.phone, `+234${registered.phone.slice(1)}`);
  assert.equal(JSON.stringify(body).includes('passwordHash'), false);
  assert.equal(JSON.stringify(body).includes(password), false);
  assert.equal(body.data.token, undefined);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Path=\/api/i);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const stored = await db.user.findUnique({ where: { email: registered.email } });
  assert.notEqual(stored.passwordHash, password);
  assert.ok(await bcrypt.compare(password, stored.passwordHash));
  const me = await request('/auth/me', { cookie: cookieOf(response) });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.data.user.id, stored.id);
});

test('duplicate email and normalized phone registrations are rejected without creating extra users', async () => {
  const email = await request('/auth/register', { body: { ...registered, email: registered.email.toUpperCase(), phone: '+2348099999911' } });
  const phone = await request('/auth/register', { body: { ...registered, email: `other${suffix}`, phone: `+234 ${registered.phone.slice(1)}` } });
  assert.equal(email.response.status, 409); assert.equal(phone.response.status, 409);
  assert.equal(email.body.message, phone.body.message);
  assert.equal(await db.user.count({ where: { email: `other${suffix}` } }), 0);
});

test('invalid registration and role injection are rejected at the API', async () => {
  for (const data of [{ ...registered, role: 'ADMIN' }, { ...registered, password: 'weak' }, { ...registered, confirmPassword: 'mismatch' }, { ...registered, phone: 'bad' }, { ...registered, fullName: '' }, { ...registered, email: 'invalid' }]) {
    const result = await request('/auth/register', { body: data });
    assert.equal(result.response.status, 422);
    assert.ok(result.body.fields);
  }
});

test('simultaneous duplicate registrations produce one account and one conflict', async () => {
  const input = { ...registered, email: `race${suffix}`, phone: '+2348077777788' };
  const results = await Promise.all([request('/auth/register', { body: input }), request('/auth/register', { body: input })]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [201, 409]);
  assert.equal(await db.user.count({ where: { email: input.email } }), 1);
});

test('correct login returns only safe account fields and a verifiable JWT', async () => {
  const result = await signIn();
  assert.equal(result.body.data.user.id, users.PASSENGER.id);
  assert.equal('passwordHash' in result.body.data.user, false);
  const claims = jwt.verify(decodeURIComponent(result.cookie.split('=')[1]), config.secret, { algorithms: ['HS256'], issuer: config.issuer, audience: config.audience });
  assert.equal(claims.sub, users.PASSENGER.id);
  assert.equal(claims.role, undefined);
  assert.equal(claims.exp - claims.iat, config.ttlSeconds);
  assert.ok(await db.authSession.findUnique({ where: { id: claims.jti } }));
});

test('wrong passwords, unregistered emails and disabled accounts have the same safe response', async () => {
  const wrong = await request('/auth/login', { body: { email: users.PASSENGER.email, password: 'Incorrect!Password12' } });
  const missing = await request('/auth/login', { body: { email: `missing${suffix}`, password } });
  await db.user.update({ where: { id: users.PASSENGER.id }, data: { status: 'DISABLED' } });
  const disabled = await request('/auth/login', { body: { email: users.PASSENGER.email, password } });
  await db.user.update({ where: { id: users.PASSENGER.id }, data: { status: 'ACTIVE' } });
  for (const result of [wrong, missing, disabled]) {
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.body, { success: false, message: 'Invalid email or password.' });
    assert.equal(result.response.headers.get('set-cookie'), null);
  }
});

test('anonymous users cannot read current-user or role-protected endpoints', async () => {
  for (const path of ['/auth/me', '/admin/dashboard', '/officer/dashboard', '/passenger/dashboard']) {
    assert.equal((await request(path)).response.status, 401);
  }
});

test('each role can access only its own dashboard, with backend enforcement', async () => {
  const paths = { PASSENGER: 'passenger', ADMIN: 'admin', TICKET_OFFICER: 'officer' };
  for (const [role, path] of Object.entries(paths)) {
    const { cookie } = await signIn(role);
    for (const destination of Object.values(paths)) {
      const result = await request(`/${destination}/dashboard`, { cookie });
      assert.equal(result.response.status, destination === path ? 200 : 403, `${role} → ${destination}`);
      assert.equal(JSON.stringify(result.body).includes('passwordHash'), false);
    }
  }
});

test('suspension and role changes take effect for already-issued tokens', async () => {
  const { cookie } = await signIn('ADMIN');
  await db.user.update({ where: { id: users.ADMIN.id }, data: { role: 'PASSENGER' } });
  assert.equal((await request('/admin/dashboard', { cookie })).response.status, 403);
  await db.user.update({ where: { id: users.ADMIN.id }, data: { role: 'ADMIN', status: 'SUSPENDED' } });
  assert.equal((await request('/auth/me', { cookie })).response.status, 401);
  await db.user.update({ where: { id: users.ADMIN.id }, data: { status: 'ACTIVE' } });
});

test('forged, expired and wrong-audience JWTs are rejected', async () => {
  const { cookie } = await signIn();
  const original = jwt.decode(decodeURIComponent(cookie.split('=')[1]));
  const options = { algorithm: 'HS256', subject: original.sub, jwtid: original.jti, issuer: config.issuer, audience: config.audience, expiresIn: 3600 };
  const invalidTokens = [
    jwt.sign({}, randomBytes(32).toString('hex'), options),
    jwt.sign({}, config.secret, { ...options, expiresIn: -1 }),
    jwt.sign({}, config.secret, { ...options, audience: 'wrong-service' }),
    jwt.sign({}, config.secret, { ...options, algorithm: 'HS384' }),
  ];
  for (const token of invalidTokens) assert.equal((await request('/auth/me', { cookie: `${config.cookieName}=${token}` })).response.status, 401);
});

test('logout clears the cookie and revokes replay of the old JWT; repeated logout is safe', async () => {
  const { cookie } = await signIn();
  const loggedOut = await request('/auth/logout', { cookie, body: {} });
  assert.equal(loggedOut.response.status, 200);
  assert.match(loggedOut.response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await request('/auth/me', { cookie })).response.status, 401);
  assert.equal((await request('/auth/logout', { cookie, body: {} })).response.status, 200);
});

test('a server-expired session rejects a JWT that has not yet expired', async () => {
  const { cookie } = await signIn();
  const claims = jwt.decode(decodeURIComponent(cookie.split('=')[1]));
  await db.authSession.update({ where: { id: claims.jti }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await request('/auth/me', { cookie })).response.status, 401);
});

test('CSRF protection rejects missing custom headers and unapproved origins; credentialed preflight works', async () => {
  const body = { email: users.PASSENGER.email, password };
  assert.equal((await request('/auth/login', { body, extraHeaders: { 'X-Requested-With': '' } })).response.status, 403);
  assert.equal((await request('/auth/logout', { body: {}, extraHeaders: { Origin: 'https://untrusted.example' } })).response.status, 403);
  assert.equal((await request('/auth/login', { body, extraHeaders: { 'Sec-Fetch-Site': 'cross-site' } })).response.status, 403);
  const preflight = await fetch(`${base}/auth/login`, { method: 'OPTIONS', headers: { Origin: env.clientUrls[0], 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-requested-with' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.match(preflight.headers.get('access-control-allow-headers'), /X-Requested-With/i);
});

test('Helmet security headers and authentication rate limits are active', async () => {
  const response = await fetch(`${base}/health`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(response.headers.get('content-security-policy'));
  const limited = createApp({ database: db, authRateLimits: { loginLimit: 2, registrationLimit: 1 } }).listen(0, '127.0.0.1');
  await once(limited, 'listening');
  try {
    const url = `http://127.0.0.1:${limited.address().port}/api/auth`;
    for (let index = 0; index < 3; index++) {
      const login = await fetch(`${url}/login`, { method: 'POST', headers, body: JSON.stringify({ email: `missing${suffix}`, password }) });
      assert.equal(login.status, index < 2 ? 401 : 429);
      if (index === 2) assert.ok(login.headers.get('retry-after'));
    }
    for (let index = 0; index < 2; index++) {
      const register = await fetch(`${url}/register`, { method: 'POST', headers, body: '{}' });
      assert.equal(register.status, index === 0 ? 422 : 429);
    }
  } finally { await new Promise(resolve => limited.close(resolve)); }
});
