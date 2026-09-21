import { MIN_CANCELLATION_SAMPLE } from './scoring.js';

export function fraudRules(m, { duplicateEvent = false } = {}) {
  const rules = [];
  const add = (type, score, factor, explanation) => rules.push({ type, score, factor, explanation });
  if (duplicateEvent) add('DUPLICATE_TICKET_USE', 60, 'duplicateTicketAttempts', 'A repeat presentation of an already used ticket was rejected. Review the presentation and original boarding record; this does not establish who presented the ticket.');
  if (m.invalidScansLast10Minutes >= 5) add('REPEATED_INVALID_SCANS', 40, 'invalidScansLast10Minutes', `${m.invalidScansLast10Minutes} unrecognized QR/ticket scans were recorded through this officer account within 10 minutes. Review the presented tickets, scanner and input errors; do not infer intent from the officer association.`);
  if (m.bookingsLast10Minutes > 8) add('EXCESSIVE_BOOKING_ATTEMPTS', 40, 'bookingsLast10Minutes', `${m.bookingsLast10Minutes} authenticated booking attempts occurred within 10 minutes, exceeding the threshold of 8. This suspicious activity requires review and may include ordinary retries.`);
  if (m.paymentFailuresLast30Minutes >= 3) add('REPEATED_PAYMENT_FAILURES', 40, 'paymentFailuresLast30Minutes', `${m.paymentFailuresLast30Minutes} demo payments were declined by the simulator within 30 minutes. Review the simulation scenario and retry activity; no real banking failure is implied.`);
  if (m.bookingsLast24Hours >= MIN_CANCELLATION_SAMPLE && m.cancellationsLast24Hours / m.bookingsLast24Hours >= 0.6) add('HIGH_CANCELLATION_RATE', 40, 'cancellationRate', `${m.cancellationsLast24Hours} of ${m.bookingsLast24Hours} bookings created within 24 hours were voluntarily cancelled (at least 60%, minimum sample 10). Review this unusually high cancellation activity; expired holds are excluded.`);
  return rules;
}
