import { ApiError } from '../utils/ApiError.js';
import { scoreActivity, severityForScore, MODEL_VERSION } from './scoring.js';
import { fraudRules } from './rules.js';

export const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const window = (now, minutes) => ({ gt: new Date(now.getTime() - minutes * 60000), lte: now });

export async function fraudTransaction(db, work) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000 }); }
    catch (error) {
      if (error.code === 'P2034' && attempt < 3) continue;
      if (error.code === 'P2034') throw new ApiError(409, 'Activity is being updated. Please retry this request.');
      throw error;
    }
  }
}

export async function activityMetrics(tx, userId, now) {
  const bookingsLast10Minutes = await tx.auditLog.count({ where: { userId, action: 'BOOKING_ATTEMPT', createdAt: window(now, 10) } });
  const invalidScansLast10Minutes = await tx.ticketScanLog.count({ where: { officerId: userId, result: 'INVALID', scannedAt: window(now, 10) } });
  const paymentFailuresLast30Minutes = await tx.auditLog.count({ where: { userId, action: 'DEMO_PAYMENT_DECLINED', createdAt: window(now, 30) } });
  const bookingsLast24Hours = await tx.booking.count({ where: { userId, createdAt: window(now, 1440) } });
  const cancellationsLast24Hours = await tx.booking.count({ where: { userId, bookingStatus: 'CANCELLED', createdAt: window(now, 1440) } });
  const duplicateTicketAttempts = await tx.ticketScanLog.count({ where: { result: 'ALREADY_USED', ticket: { booking: { userId } }, scannedAt: window(now, 1440) } });
  return { bookingsLast10Minutes, invalidScansLast10Minutes, paymentFailuresLast30Minutes, bookingsLast24Hours, cancellationsLast24Hours, duplicateTicketAttempts };
}

// Must be called inside the operation's retryable transaction. The account lock
// serializes assessments/cooldown checks; source IDs make replay idempotent.
export async function assessActivity(tx, { userId, sourceId, sourceType, bookingId, ticketId, officerId, duplicateEvent = false, now }) {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
  // Capture the window after waiting for competing assessments to commit.
  now ??= new Date();
  const metrics = await activityMetrics(tx, userId, now), assessment = scoreActivity(metrics);
  const context = { sourceId, sourceType, ...(officerId ? { officerId } : {}), observedAt: now.toISOString(),
    subjectScope: sourceType === 'INVALID_SCAN' ? 'OFFICER_SCAN_ACTIVITY' : 'ASSOCIATED_PASSENGER_ACTIVITY' };
  const created = [];
  async function persist({ type, score, explanation, features, perEvent = false }) {
    const severity = severityForScore(score);
    if (!perEvent) {
      const recent = await tx.fraudAlert.findFirst({ where: { userId, type, ...(type === 'ANOMALY_SCORE' ? { severity } : {}), createdAt: window(now, ALERT_COOLDOWN_MS / 60000) }, select: { id: true } });
      if (recent) return;
    }
    const dedupeKey = `${type}:${sourceType}:${sourceId}`;
    const alert = await tx.fraudAlert.upsert({ where: { dedupeKey }, update: {}, create: { dedupeKey, userId, bookingId, ticketId, type, severity, score,
      description: explanation, features: { ...features, ...context, modelVersion: MODEL_VERSION }, createdAt: now } });
    created.push(alert.id);
  }
  for (const rule of fraudRules(assessment.metrics, { duplicateEvent })) {
    await persist({ type: rule.type, score: rule.score, explanation: rule.explanation, perEvent: rule.type === 'DUPLICATE_TICKET_USE',
      features: { basis: 'DETERMINISTIC_RULE', metrics: assessment.metrics, contributions: [{ factor: rule.factor, points: rule.score }], anomalySnapshot: assessment } });
  }
  if (assessment.score >= 30) await persist({ type: 'ANOMALY_SCORE', score: assessment.score, explanation: assessment.explanation,
    features: { basis: 'ANOMALY_MODEL', ...assessment } });
  return { assessment, alertIds: created };
}

// Persist before reservation validation/availability checks, so rejected HTTP
// attempts count too. Internal database retries never create extra attempts.
export async function recordBookingAttempt(db, userId) {
  return fraudTransaction(db, async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
    const event = await tx.auditLog.create({ data: { userId, action: 'BOOKING_ATTEMPT', entityType: 'User', entityId: userId } });
    return assessActivity(tx, { userId, sourceId: event.id, sourceType: 'BOOKING_ATTEMPT' });
  });
}
