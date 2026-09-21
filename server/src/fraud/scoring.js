export const MODEL_VERSION = 'railconnect-risk-v1';
export const MIN_CANCELLATION_SAMPLE = 10;
const clamp = (n, maximum) => Math.min(maximum, Math.max(0, n));
const round = n => Math.round(n * 100) / 100;

export function severityForScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new TypeError('Score must be an integer from 0 to 100.');
  return score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
}

// Policy-based, explainable anomaly scoring; not a trained model or probability.
export function scoreActivity(input) {
  const names = ['bookingsLast10Minutes', 'invalidScansLast10Minutes', 'paymentFailuresLast30Minutes', 'bookingsLast24Hours', 'cancellationsLast24Hours', 'duplicateTicketAttempts'];
  const m = Object.fromEntries(names.map(name => [name, input[name] ?? 0]));
  for (const value of Object.values(m)) if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Activity counts must be non-negative integers.');
  if (m.cancellationsLast24Hours > m.bookingsLast24Hours) throw new TypeError('Cancellations cannot exceed the booking cohort.');
  const cancellationRate = m.bookingsLast24Hours ? m.cancellationsLast24Hours / m.bookingsLast24Hours : 0;
  const add = (factor, value, points, maximum, explanation) => ({ factor, value, points: round(points), maximum, explanation });
  const contributions = [
    add('bookingsLast10Minutes', m.bookingsLast10Minutes, clamp((m.bookingsLast10Minutes - 8) * 5, 25), 25, `${m.bookingsLast10Minutes} booking attempts in 10 minutes`),
    add('invalidScansLast10Minutes', m.invalidScansLast10Minutes, clamp(m.invalidScansLast10Minutes * 7, 40), 40, `${m.invalidScansLast10Minutes} unrecognized QR/ticket scans in 10 minutes`),
    add('paymentFailuresLast30Minutes', m.paymentFailuresLast30Minutes, clamp(m.paymentFailuresLast30Minutes * 10, 30), 30, `${m.paymentFailuresLast30Minutes} demo provider declines in 30 minutes`),
    add('bookingsLast24Hours', m.bookingsLast24Hours, clamp((m.bookingsLast24Hours - 20) * 1.5, 15), 15, `${m.bookingsLast24Hours} created bookings in 24 hours`),
    add('cancellationRate', cancellationRate, m.bookingsLast24Hours >= MIN_CANCELLATION_SAMPLE ? clamp((cancellationRate - 0.3) / 0.5 * 25, 25) : 0, 25,
      `${m.cancellationsLast24Hours} cancellations among ${m.bookingsLast24Hours} bookings created in 24 hours${m.bookingsLast24Hours < MIN_CANCELLATION_SAMPLE ? ' (insufficient sample)' : ''}`),
    add('duplicateTicketAttempts', m.duplicateTicketAttempts, m.duplicateTicketAttempts ? clamp(55 + 5 * m.duplicateTicketAttempts, 80) : 0, 80, `${m.duplicateTicketAttempts} repeat presentations of used tickets in 24 hours`),
  ];
  const rawScore = round(contributions.reduce((sum, c) => sum + c.points, 0));
  const score = Math.min(100, Math.round(rawScore));
  const reasons = contributions.filter(c => c.points > 0).map(c => `${c.explanation} (+${c.points})`);
  return { modelVersion: MODEL_VERSION, score, severity: severityForScore(score), rawScore,
    metrics: { ...m, cancellationRate }, contributions,
    explanation: reasons.length ? `Activity requires review: ${reasons.join('; ')}. This score is an indicator, not a finding of wrongdoing.` : 'No elevated activity score in the observed windows. This does not guarantee the absence of suspicious activity.' };
}
