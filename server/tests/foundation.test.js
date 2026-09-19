import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import app from '../src/app.js';
import { env, parseEnvironment } from '../src/config/env.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

test('health endpoint returns real service information without cache or framework disclosure', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.service, 'RailConnect API');
  assert.ok(Number.isFinite(Date.parse(body.data.timestamp)));
  assert.ok(body.data.uptimeSeconds >= 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('configured frontend origin can read the API', async () => {
  const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: env.clientUrls[0] } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), env.clientUrls[0]);
});

test('allowed browser preflight succeeds', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: env.clientUrls[0], 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), env.clientUrls[0]);
});

test('unapproved origins receive a safe JSON error', async () => {
  const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await response.json(), { success: false, message: 'This origin is not allowed.' });
});

test('unknown endpoints return JSON 404 errors', async () => {
  const response = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { success: false, message: 'The requested endpoint was not found.' });
});

test('malformed JSON receives 400 without echoing request content', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private":',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, message: 'The request body must contain valid JSON.' });
});

test('oversized request bodies receive 413', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(17 * 1024) }),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).success, false);
});

test('unexpected asynchronous failures reach the central handler without leaking internals', async (context) => {
  const testApp = express();
  testApp.get('/failure', async () => { throw new Error('private database credentials'); });
  testApp.use(errorHandler);
  const log = context.mock.method(console, 'error', () => {});
  const testServer = testApp.listen(0, '127.0.0.1');
  await once(testServer, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${testServer.address().port}/failure`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { success: false, message: 'An unexpected server error occurred.' });
    assert.equal(log.mock.calls.length, 1);
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
});

test('environment configuration supplies usable development defaults', () => {
  const config = parseEnvironment({});
  assert.equal(config.port, 5000);
  assert.equal(config.nodeEnv, 'development');
  assert.ok(config.clientUrls.includes('http://localhost:5173'));
});

test('invalid configuration fails early', () => {
  for (const port of ['abc', '0', '65536', '5000.5', '']) {
    assert.throws(() => parseEnvironment({ PORT: port }), /PORT/);
  }
  for (const origin of ['', '*', 'ftp://localhost', 'http://localhost:5173/', 'http://localhost:5173/path']) {
    assert.throws(() => parseEnvironment({ CLIENT_URL: origin }), /CLIENT_URL/);
  }
  assert.throws(() => parseEnvironment({ NODE_ENV: 'invalid' }), /NODE_ENV/);
  assert.throws(() => parseEnvironment({ HOST: '' }), /HOST/);
});
