// Requires the frontend on localhost:5173. Uses an isolated API, database fixtures
// and browser context; never changes demonstration account credentials.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import QRCode from 'qrcode';
import { systemFixture } from '../server/tests/helpers/system-fixture.js';
import { railwayDate } from '../server/src/services/search.service.js';

const output = new URL('../.verification/', import.meta.url);
const artifactPrefix = process.env.BROWSER_ARTIFACT_PREFIX ?? 'phase14';
if (!/^[a-z0-9-]+$/.test(artifactPrefix)) throw new Error('Use a simple artifact prefix.');
await mkdir(output, { recursive: true });
const frontend = 'http://localhost:5173';
const cdp = process.env.BROWSER_CDP_URL ?? 'http://localhost:9222';
const version = await fetch(`${cdp}/json/version`).then(response => response.json());
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0, sessionId, contextId, f, blockedPath, pausedPath;
const pausedRequests = [];
const pending = new Map(), exceptions = [], checks = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const entry = pending.get(message.id); if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timer); message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
  else if (message.method === 'Fetch.requestPaused') {
    const { requestId, request } = message.params;
    if (blockedPath && request.url.includes(blockedPath)) send('Fetch.fulfillRequest', { requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: frontend }, { name: 'Access-Control-Allow-Credentials', value: 'true' }], body: Buffer.from(JSON.stringify({ success: false, message: 'Test service unavailable' })).toString('base64') }).catch(error => exceptions.push(error.message));
    else if (pausedPath && request.url.includes(pausedPath)) pausedRequests.push({ requestId, url: request.url.replace('http://localhost:5000/api', f.base) });
    else send('Fetch.continueRequest', { requestId, url: request.url.replace('http://localhost:5000/api', f.base) }).catch(error => { if (!error.message.includes('Invalid InterceptionId')) exceptions.push(error.message); });
  }
};
function send(method, params = {}, browser = false) {
  const id = ++sequence;
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(!browser && sessionId ? { sessionId } : {}) })); });
}
async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression) { for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Browser condition timed out: ${expression}`); }
const click = selector => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.focus();element.click();})()`);
async function navigate(path, condition = '!!document.querySelector("h1")') { await send('Page.navigate', { url: `${frontend}${path}` }); await waitFor(condition); }
async function setInput(selector, value) { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
async function fill(values, prefix = '') { for (const [name, value] of Object.entries(values)) await setInput(`${prefix}[name="${name}"]`, value); }
async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(new URL(`${artifactPrefix}-${name}.png`, output), Buffer.from(result.data, 'base64')); }
async function press(key, code = key) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function responsive(name) {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }); await delay(100);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}: horizontal page overflow at ${width}px`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('input,select,textarea')).filter(el => el.getClientRects().length && el.type !== 'hidden' && !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).map(el=>el.name || el.id || el.tagName)`), [], `${name}: every visible form control needs a label`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('button')).filter(el=>el.getClientRects().length && !el.textContent.trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')).map(el=>el.className)`), [], `${name}: every visible button needs a name`);
    if ([390, 1440].includes(width)) await screenshot(`${name}-${width}`);
  }
  checks.push(`${name}: layout passed at 320, 390, 768, 1024 and 1440px`);
}
async function mobileNavigation(admin = false) {
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('.navigation-toggle');
  assert.equal(await evaluate('document.querySelector(".navigation-toggle").getAttribute("aria-expanded")'), 'true');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".auth-nav a, .auth-nav button")).every(el=>el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().width > 0)'));
  await press('Escape');
  assert.ok(await evaluate('document.activeElement === document.querySelector(".navigation-toggle") && document.querySelector(".navigation-toggle").getAttribute("aria-expanded") === "false"'));
  if(admin) {
    await click('.admin-navigation-toggle');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("#admin-navigation a")).filter(el=>el.getClientRects().length).length'), 10);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await evaluate('document.querySelector("#admin-navigation a").focus()'); await press('Escape');
    assert.ok(await evaluate('document.activeElement === document.querySelector(".admin-navigation-toggle")'));
  }
  checks.push(`${admin ? 'Admin' : 'Passenger/public'} navigation expands at 320px with all actions visible; Escape restores focus`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
}
async function signIn(email, returnPath) { await navigate('/login', '!!document.querySelector("[name=email]")'); await fill({ email, password: f.password }); await evaluate('document.querySelector(".auth-form").requestSubmit()'); await waitFor(returnPath ? `location.pathname === ${JSON.stringify(returnPath)}` : 'location.pathname.endsWith("/dashboard")'); }
async function signOut() { await click('.auth-nav button'); await waitFor('location.pathname === "/login"'); }
async function submitEditor() { await evaluate('document.querySelector("dialog form").requestSubmit()'); await waitFor('!document.querySelector("dialog") || !!document.querySelector("dialog [role=alert]")'); assert.equal(await evaluate('document.querySelector("dialog [role=alert]")?.textContent'), undefined); await waitFor('!document.querySelector(":is(.admin-state, .feedback-state)[role=status]")'); }
async function create(resource, values) {
  await navigate(`/admin/${resource}`, '!!document.querySelector(".admin-heading button") && !document.querySelector(":is(.admin-state, .feedback-state)[role=status]")');
  await responsive(`manage-${resource}`);
  await click('.admin-heading button'); await waitFor('!!document.querySelector("dialog form")');
  if(resource === 'stations') {
    await responsive('station-editor');
    await evaluate('document.querySelector("dialog input").focus()'); await press('Tab');
    assert.ok(await evaluate('document.querySelector("dialog").contains(document.activeElement)'));
    await evaluate(`(()=>{const dialog=document.querySelector('dialog'),r=dialog.getBoundingClientRect();dialog.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+2,clientY:r.top+2}));})()`);
    assert.ok(await evaluate('!!document.querySelector("dialog[open]")'), 'Clicking dialog padding must not dismiss the editor');
    await press('Escape'); await waitFor('!document.querySelector("dialog")');
    assert.ok(await evaluate('document.activeElement === document.querySelector(".admin-heading button")'), 'Closing dialog restores its trigger');
    await click('.admin-heading button'); await waitFor('!!document.querySelector("dialog form")');
    checks.push('Editor has labelled fields, contained keyboard focus, Escape/focus restoration and safe padding clicks');
  }
  await fill(values, 'dialog '); await submitEditor();
}
async function filter(text) { await setInput('.admin-search input', text); await delay(400); await waitFor('!!document.querySelector(".admin-table") && !document.querySelector(":is(.admin-state, .feedback-state)")'); }
async function edit(values) { await click('.admin-table tbody tr button[title^="Edit"]'); await waitFor('!!document.querySelector("dialog form")'); await fill(values, 'dialog '); await submitEditor(); }
async function remove() { await click('.admin-table tbody tr button[title^="Delete"]'); await waitFor('!!document.querySelector("dialog")'); await click('dialog .button-danger'); await waitFor('!document.querySelector("dialog") || !!document.querySelector("dialog [role=alert]")'); assert.equal(await evaluate('document.querySelector("dialog [role=alert]")?.textContent'), undefined); await waitFor('!document.querySelector(":is(.admin-state, .feedback-state)[role=status]")'); }

try {
  f = await systemFixture({ host: 'localhost', worker: true });
  ({ browserContextId: contextId } = await send('Target.createBrowserContext', {}, true));
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, true);
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, true));
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http://localhost:5000/api/*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__tracks=[];navigator.mediaDevices.getUserMedia=async options=>{if(options.audio!==false)throw Error('Unexpected audio request');const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,480);const img=new Image();img.src=window.__qr;await img.decode();ctx.drawImage(img,140,60,360,360);const stream=canvas.captureStream(5);window.__tracks.push(...stream.getTracks());window.__canvas=canvas;return stream;};` });

  await navigate('/'); await responsive('homepage'); await mobileNavigation();
  await navigate('/search'); await responsive('search-start');
  await navigate('/status', '!!document.querySelector(".status-card h2")'); await responsive('service-status');
  await navigate('/does-not-exist'); await responsive('not-found');
  await navigate('/login', '!!document.querySelector("[name=password]")'); await responsive('login');
  await navigate('/register', '!!document.querySelector("[name=confirmPassword]")'); await responsive('registration');
  const email = `passenger@${f.tag}.test`;
  await fill({ fullName: `${f.tag} Browser Passenger`, email, phone: `080${Date.now().toString().slice(-8)}`, password: f.password, confirmPassword: f.password });
  await evaluate('document.querySelector(".auth-form").requestSubmit()'); await waitFor('location.pathname === "/passenger/dashboard"');
  await waitFor('!!document.querySelector(".account-card")'); await responsive('passenger-dashboard'); await mobileNavigation();
  await navigate('/passenger/bookings', '!!document.querySelector(".public-state")'); await responsive('empty-bookings');
  assert.ok(await evaluate('document.body.textContent.includes("No bookings yet")'));
  await navigate('/passenger/tickets', '!!document.querySelector(".public-state")'); await responsive('empty-tickets');
  checks.push('Empty passenger lists explain the next step and link to train search');
  pausedPath = '/bookings?';
  await navigate('/passenger/bookings', '!!document.querySelector(".feedback-state.loading")');
  await responsive('bookings-loading');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".feedback-state.loading > svg")).animationName'), 'none');
  await send('Emulation.setEmulatedMedia', { features: [] });
  pausedPath = null;
  for (const request of pausedRequests.splice(0)) await send('Fetch.continueRequest', request);
  await waitFor('!!document.querySelector(".public-state")');
  blockedPath = '/bookings?';
  await navigate('/passenger/bookings', '!!document.querySelector(".feedback-state.error")'); await responsive('bookings-error');
  const contrast = await evaluate(`(()=>{
    const luminance = color => {const values=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
    return ['body','.button-primary','.feedback-title','.feedback-description'].map(selector=>{const el=document.querySelector(selector);let parent=el,bg;while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;parent=parent.parentElement;}const a=luminance(getComputedStyle(el).color),b=luminance(bg);return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
  })()`);
  for (const sample of contrast) assert.ok(sample.ratio >= 4.5, `${sample.selector}: text contrast below 4.5:1`);
  checks.push('Sampled body, primary button and error feedback text meet 4.5:1 contrast');
  blockedPath = null; await click('.feedback-state button'); await waitFor('!!document.querySelector(".public-state") && !document.querySelector(".feedback-state")');
  checks.push('Passenger loading, empty, network-error and retry states work; reduced-motion disables the loading animation');
  await navigate('/passenger/tickets', '!!document.querySelector(".public-state")');
  await signOut(); await signIn(email, '/passenger/tickets'); checks.push('Passenger registered, logged out and logged in, returning to the allowed ticket page');
  await navigate('/admin/bookings', 'location.pathname === "/unauthorized"'); checks.push('Passenger admin-route access rejected');
  const query = new URLSearchParams({ originId: f.stations[0].id, destinationId: f.stations[1].id, date: railwayDate(new Date(f.schedules[0].departureTime)) });
  await navigate(`/search?${query}`, '!!document.querySelector(".result-booking-link")'); await responsive('search');
  assert.ok(await evaluate('document.body.textContent.includes("Best Overall")')); checks.push('Search returned the real scheduled train and recommendation');
  await click('.result-booking-link'); await waitFor('document.querySelectorAll(".seat-button").length === 8'); await responsive('seat-selection');
  await click('[aria-label="Seat E1, Economy, Available"]'); await click('.booking-primary'); await waitFor('!!document.querySelector(".reservation-panel .booking-primary:not(:disabled)")'); await responsive('booking-review');
  await click('.reservation-panel .booking-primary'); await waitFor('document.querySelector(".booking-status")?.textContent === "PENDING"');
  const bookingId = await evaluate('location.pathname.split("/").at(-1)');
  await click('a[href$="/payment"]'); await waitFor('!!document.querySelector(".demo-checkout .booking-primary:not(:disabled)")'); await responsive('payment');
  assert.equal(await evaluate('document.querySelectorAll(".payment-page input:not([type=radio])").length'), 0);
  await click('.demo-checkout .booking-primary'); await waitFor('document.querySelector(".demo-payment-result h3")?.textContent === "Demo payment successful"');
  await waitFor(`!!document.querySelector('a[href*="/passenger/tickets/"]')`); await click('a[href*="/passenger/tickets/"]'); await waitFor('!!document.querySelector(".ticket-document")'); await responsive('ticket');
  const ticket = await f.db.ticket.findUnique({ where: { bookingId } }); assert.equal(ticket.status, 'VALID');
  checks.push('Seat selection, review, pending booking, server-paid demo payment and QR ticket completed');
  await navigate('/passenger/bookings', '!!document.querySelector(".my-booking")'); await responsive('my-bookings');
  await navigate('/passenger/tickets', '!!document.querySelector(".ticket-card")'); await responsive('my-tickets');
  await signOut(); await signIn(f.users.find(user => user.role === 'TICKET_OFFICER').email);
  await responsive('officer-dashboard');
  await navigate('/officer/verify', '!!document.querySelector(".officer-schedule select")');
  await setInput('input[type=date]', railwayDate(new Date(f.schedules[0].departureTime)));
  await waitFor(`!!document.querySelector('option[value="${f.schedules[0].id}"]') && !document.querySelector('.officer-schedule select').disabled`);
  await setInput('.officer-schedule select', f.schedules[0].id); await waitFor('!document.querySelector(".officer-camera-start").disabled');
  await evaluate(`window.__qr=${JSON.stringify(await QRCode.toDataURL(ticket.qrToken, { errorCorrectionLevel: 'H', margin: 4, scale: 6 }))}`);
  await click('.officer-camera-start'); await waitFor('document.querySelector(".officer-result h2")?.textContent === "VALID TICKET"'); await responsive('officer-valid');
  assert.ok(await evaluate('window.__tracks.every(track=>track.readyState==="ended")'));
  await click('.officer-confirm'); await waitFor('document.querySelector(".officer-result h2")?.textContent === "BOARDING CONFIRMED"');
  await click('.officer-reset'); await setInput('#ticket-entry', ticket.ticketNumber); await evaluate('document.querySelector(".officer-manual").requestSubmit()');
  await waitFor('document.querySelector(".officer-result h2")?.textContent === "TICKET ALREADY USED"'); await responsive('officer-duplicate');
  assert.equal((await f.db.ticket.findUnique({ where: { id: ticket.id } })).status, 'USED');
  assert.equal(await f.db.ticketScanLog.count({ where: { ticketId: ticket.id, result: 'ALREADY_USED' } }), 1);
  const alert = await f.db.fraudAlert.findFirst({ where: { ticketId: ticket.id, type: 'DUPLICATE_TICKET_USE' } }); assert.equal(alert.severity, 'HIGH');
  checks.push('Officer decoded camera QR, boarded once, rejected reuse, logged scan and created HIGH alert');
  await signOut(); await signIn(f.users.find(user => user.role === 'ADMIN').email); await waitFor('document.querySelectorAll(".monitor-stats .admin-stat").length === 8'); await responsive('admin-dashboard');
  await mobileNavigation(true);
  await setInput('[aria-label="Report from"]', railwayDate()); await setInput('[aria-label="Report to"]', railwayDate());
  await evaluate('document.querySelector(".monitor-report-controls form").requestSubmit()'); await waitFor('!!document.querySelector(".monitor-trend") && !document.querySelector(":is(.admin-state, .feedback-state)")');
  assert.ok(await evaluate('document.querySelectorAll(".monitor-charts section").length === 4')); checks.push('Admin dashboard displays real cards and four charts; date filter applied');
  for (const resource of ['bookings', 'payments']) {
    await navigate(`/admin/${resource}`, '!!document.querySelector("input[name=q]")'); await setInput('[name=q]', f.tag);
    await evaluate('document.querySelector(".monitor-filters").requestSubmit()'); await waitFor('!!document.querySelector(".admin-table tbody tr")'); await responsive(`admin-${resource}`);
    assert.ok(await evaluate(`document.querySelector('.admin-table').textContent.includes(${JSON.stringify(f.tag)})`));
  }
  await navigate('/admin/fraud', '!!document.querySelector(".monitor-filters")'); await setInput('[name=severity]', 'HIGH'); await evaluate('document.querySelector(".monitor-filters").requestSubmit()');
  await waitFor(`!!document.querySelector('a[href="/admin/fraud/${alert.id}"]')`); await responsive('fraud-list'); await click(`a[href="/admin/fraud/${alert.id}"]`); await waitFor('!!document.querySelector(".monitor-detail-hero")'); await responsive('fraud-detail');
  const action = async label => evaluate(`Array.from(document.querySelectorAll('.monitor-actions button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`);
  for (const label of ['Mark under review', 'Resolve']) {
    await action(label); await waitFor('!!document.querySelector("dialog textarea")'); await setInput('dialog textarea', 'Officer confirmed this was an accidental repeat scan.');
    await evaluate('document.querySelector("dialog form").requestSubmit()'); await waitFor('!document.querySelector("dialog") && !!document.querySelector(".monitor-detail-hero")');
  }
  assert.equal((await f.db.fraudAlert.findUnique({ where: { id: alert.id } })).status, 'RESOLVED');
  await navigate('/admin/audit-logs', '!!document.querySelector(".admin-table tbody tr")'); await responsive('audit-log'); assert.ok(await evaluate('document.body.textContent.includes("Fraud alert reviewed")'));
  checks.push('Admin inspected bookings/payments, filtered fraud, reviewed and resolved alert with audit history');
  blockedPath = '/admin/monitoring'; await navigate('/admin/dashboard', '!!document.querySelector(":is(.admin-state, .feedback-state)[role=alert]")');
  assert.equal(await evaluate('document.querySelectorAll(".monitor-stats .admin-stat").length'), 0); blockedPath = null; await click(':is(.admin-state, .feedback-state) button'); await waitFor('document.querySelectorAll(".monitor-stats .admin-stat").length === 8'); checks.push('Report network error hides stale totals; retry recovers');

  // CRUD records are independent from the booked journey and removed through UI.
  const extra = `${f.tag}-C`;
  await create('stations', { name: `${extra} Test station`, code: extra, city: 'Abuja', state: 'FCT' }); await filter(extra); await edit({ name: `${extra} Edited` }); await remove();
  await create('routes', { originStationId: f.stations[1].id, destinationStationId: f.stations[0].id, distanceKm: '150', estimatedDuration: '90' });
  await filter(f.tag); await edit({ estimatedDuration: '95' }); await remove();
  const trainCode = `${f.tag}-T`;
  await create('trains', { name: trainCode, code: trainCode, capacity: '2' }); await filter(trainCode); await edit({ name: `${trainCode} Edited`, status: 'INACTIVE' }); await remove();
  const localTime = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await create('schedules', { trainId: f.train.id, routeId: f.route.id, departureTime: localTime(new Date(Date.now() + 4 * 86400000)), arrivalTime: localTime(new Date(Date.now() + 4 * 86400000 + 5400000)), fareEconomy: '3500.00', fareBusiness: '6000.00' });
  await filter(f.tag); await edit({ fareEconomy: '3600.00' }); await remove();
  checks.push('Admin created, viewed, edited and deleted stations, routes, trains and schedules through confirmation dialogs');
  assert.deepEqual(exceptions, []); checks.push('No uncaught browser JavaScript exceptions');
  await writeFile(new URL(`${artifactPrefix}-browser.json`, output), JSON.stringify({ result: 'passed', checkedAt: new Date().toISOString(), checks, limitations: ['Camera frames were simulated; no physical camera or physical mobile device was tested.'] }, null, 2));
  console.log(JSON.stringify({ result: 'passed', checks }, null, 2));
} catch (error) {
  if (sessionId) await screenshot('failure').catch(() => {});
  await writeFile(new URL(`${artifactPrefix}-browser.json`, output), JSON.stringify({ result: 'failed', checks, error: error.message }, null, 2)); throw error;
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, true).catch(() => {});
  socket.close(); if (f) await f.cleanup();
}
