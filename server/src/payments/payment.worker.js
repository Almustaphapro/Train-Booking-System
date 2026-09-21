import { settlePayment } from './payment.service.js';

export function startPaymentWorker(getDatabase, config, intervalMs = 2000) {
  let running = null, stopped = false;
  async function process() {
    if (!config.enabled) return;
    const db = getDatabase();
    const pending = await db.payment.findMany({ where: { provider: 'DEMO', status: 'PENDING', readyAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true } });
    for (const row of pending) { try { await settlePayment(db, row.id); } catch { console.error('Demo payment verification failed; it will be retried.'); } }
  }
  const run = () => { if (!stopped && !running) running = Promise.resolve().then(process).catch(() => console.error('Demo payment worker unavailable; it will retry.')).finally(() => { running = null; }); };
  const timer = setInterval(run, intervalMs); timer.unref(); run();
  return async () => { stopped = true; clearInterval(timer); if (running) await running; };
}
