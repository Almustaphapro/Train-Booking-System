import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createPaymentLimiter, createApiLimiter } from '../src/security/apiRateLimit.js';

test('default payment limiter permits 20 attempts, rejects the 21st, and separates accounts sharing an IP', async () => {
  const app = express();
  app.use((request, _response, next) => { request.user = { id: request.headers['test-user'] ?? 'first' }; next(); });
  app.post('/', createPaymentLimiter(), (_request, response) => response.json({ success: true }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    for (let i = 0; i < 20; i++) assert.equal((await fetch(url, { method: 'POST' })).status, 200);
    const limited = await fetch(url, { method: 'POST' }); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after')); assert.ok(limited.headers.get('ratelimit'));
    assert.equal((await fetch(url, { method: 'POST', headers: { 'test-user': 'second' } })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('API limiter rejects excess requests and resumes after its window', async () => {
  const app = express(); app.use(createApiLimiter({ limit: 2, windowMs: 1000 })); app.get('/', (_request, response) => response.json({ success: true }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(url)).status, 200); assert.equal((await fetch(url)).status, 200); assert.equal((await fetch(url)).status, 429);
    await new Promise(resolve => setTimeout(resolve, 1050)); assert.equal((await fetch(url)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
