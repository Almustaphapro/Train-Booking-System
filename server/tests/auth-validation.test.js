import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { registrationSchema, loginSchema } from '../src/validators/auth.validators.js';
import { parseAuthConfig } from '../src/config/auth.js';

const input = { fullName: 'Ada Okafor', email: 'ADA@example.test ', phone: '0801 234 5678', password: 'Strong!Pass1234', confirmPassword: 'Strong!Pass1234' };

test('registration normalizes email and Nigerian phone formats', () => {
  const result = registrationSchema.parse(input);
  assert.equal(result.email, 'ada@example.test');
  assert.equal(result.phone, '+2348012345678');
  assert.equal(registrationSchema.parse({ ...input, phone: '+234 (801) 234-5678' }).phone, result.phone);
});

test('registration validates every field and rejects privilege injection', () => {
  for (const field of Object.keys(input)) assert.equal(registrationSchema.safeParse({ ...input, [field]: '' }).success, false, field);
  for (const invalid of [
    { email: 'not-an-email' }, { phone: 'abc08012345678' }, { password: 'short', confirmPassword: 'short' },
    { password: 'alllowercase12', confirmPassword: 'alllowercase12' }, { confirmPassword: 'different' },
    { role: 'ADMIN' }, { status: 'ACTIVE' }, { fullName: 'A\u0000B' },
    { password: `Aa1!${'界'.repeat(24)}`, confirmPassword: `Aa1!${'界'.repeat(24)}` },
  ]) assert.equal(registrationSchema.safeParse({ ...input, ...invalid }).success, false);
});

test('login validates types and preserves password characters', () => {
  assert.equal(loginSchema.safeParse({ email: [], password: {} }).success, false);
  assert.equal(loginSchema.parse({ email: 'Ada@example.test', password: ' secret ' }).password, ' secret ');
});

test('auth configuration fails closed for missing secrets and invalid lifetimes', () => {
  assert.throws(() => parseAuthConfig({}), /JWT_SECRET/);
  const secret = randomBytes(32).toString('hex');
  for (const ttl of ['0', '-1', '86401', '1h', '']) assert.throws(() => parseAuthConfig({ JWT_SECRET: secret, JWT_TTL_SECONDS: ttl }), /JWT_TTL_SECONDS/);
  const production = parseAuthConfig({ JWT_SECRET: secret, NODE_ENV: 'production' });
  assert.equal(production.cookieOptions.secure, true);
  assert.equal(production.cookieOptions.httpOnly, true);
  assert.equal(production.cookieOptions.sameSite, 'lax');
  assert.match(production.cookieName, /^__Secure-/);
});
