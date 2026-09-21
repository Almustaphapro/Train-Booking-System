import { releaseExpiredHolds } from './booking.service.js';

export function startHoldCleanup(getDatabase, intervalMs = 30000) {
  let running = null, stopped = false;
  const run = () => {
    if (stopped || running) return;
    running = Promise.resolve().then(() => releaseExpiredHolds(getDatabase())).catch(() => console.error('Seat hold cleanup failed; it will retry on the next interval.')).finally(() => { running = null; });
  };
  const timer = setInterval(run, intervalMs); timer.unref(); run();
  return async () => { stopped = true; clearInterval(timer); if (running) await running; };
}
