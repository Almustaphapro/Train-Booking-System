# Phase 11 — Fraud and Anomaly Detection

RailConnect now records suspicious activity using deterministic rules and a transparent, multi-factor anomaly score. Alerts require human review. They do not declare wrongdoing, suspend an account or change a booking's eligibility. Existing server-side ticket checks still reject reused or invalid tickets.

This is a policy-based expert system, not a trained machine-learning model or a probability of fraud. Its intelligence comes from combining recent activity across related database records and explaining each contribution. The thresholds are demonstration policies that require calibration against representative data before operational use.

## Rules and observations

| Alert type                   | Trigger                                                                                                      | Rule score / severity           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `DUPLICATE_TICKET_USE`       | Each rejected presentation of an already-used ticket, including a repeated boarding confirmation             | 60 / HIGH                       |
| `REPEATED_INVALID_SCANS`     | At least 5 unrecognized QR/token/ticket entries through one officer account in 10 minutes                    | 40 / MEDIUM                     |
| `EXCESSIVE_BOOKING_ATTEMPTS` | More than 8 authenticated passenger booking requests in 10 minutes                                           | 40 / MEDIUM                     |
| `REPEATED_PAYMENT_FAILURES`  | At least 3 demo provider declines in 30 minutes                                                              | 40 / MEDIUM                     |
| `HIGH_CANCELLATION_RATE`     | At least 60% voluntarily cancelled, among at least 10 bookings created by one passenger in the last 24 hours | 40 / MEDIUM                     |
| `ANOMALY_SCORE`              | Combined score reaches 30 or more                                                                            | Calculated score and band below |

The server measures rolling windows as `(now - window, now]`, using server timestamps. Authenticated, CSRF-checked booking requests are logged before field validation and seat availability checks, so rejected requests count. Requests rejected before reaching this middleware, such as malformed JSON, anonymous traffic or CSRF failures, do not count. Database transaction retries do not create extra attempts.

Only actual provider-declined demo payments count as payment failures. Their audit action is `DEMO_PAYMENT_DECLINED`. Failed records caused by expired holds, cancellations or an unpayable reservation are excluded. Re-reading or retrying settlement of the same payment does not add failures. Older generic `DEMO_PAYMENT_FAILED` events are not backfilled because their cause cannot be distinguished reliably.

The cancellation denominator is bookings **created within the last 24 hours**, and the numerator is those same bookings whose current status is `CANCELLED`. This compares one consistent cohort. `EXPIRED` holds are excluded from the numerator. Repeating an already-completed cancellation does not add activity.

An unknown QR cannot identify a passenger. Invalid scans are therefore grouped by the officer account recording them, with `subjectScope: OFFICER_SCAN_ACTIVITY`. This association does not imply the officer caused the suspicious activity. Duplicate presentations relate to the ticket's booking owner, ticket and booking, and retain the scanning officer ID in the evidence. Ownership does not establish who presented the ticket. Reviewers must consider mistakes, lost responses, scanner faults and the demonstration payment scenario.

## Explainable score

Model version: `railconnect-risk-v1`. Let `clamp(x, cap)` mean `min(cap, max(0, x))`.

| Factor                                       | Contribution in points                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `bookingsLast10Minutes` (attempts)           | `clamp((attempts - 8) × 5, 25)`                                                   |
| `invalidScansLast10Minutes`                  | `clamp(scans × 7, 40)`                                                            |
| `paymentFailuresLast30Minutes`               | `clamp(declines × 10, 30)`                                                        |
| `bookingsLast24Hours` (created reservations) | `clamp((bookings - 20) × 1.5, 15)`                                                |
| `cancellationRate`                           | With at least 10 bookings: `clamp((rate - 0.30) / 0.50 × 25, 25)`; otherwise zero |
| `duplicateTicketAttempts` in 24 hours        | Zero when none; otherwise `min(55 + attempts × 5, 80)`                            |

Each contribution is rounded to two decimal places. The raw sum is retained, and `score = min(100, round(raw sum))`.

| Score  | Severity |
| ------ | -------- |
| 0–29   | LOW      |
| 30–59  | MEDIUM   |
| 60–79  | HIGH     |
| 80–100 | CRITICAL |

For example, 12 booking attempts in 10 minutes contribute 20 points; 3 declined payments contribute 30; 6 cancellations from 10 bookings contribute 15. With no other factors, the score is **65, HIGH**. The stored explanation names these observations, windows and points. A single repeat presentation contributes 60 points; five within a day contribute 80. The final cap prevents combined activity from exceeding 100.

Rule scores express a fixed review priority and are distinct from the aggregate model score. For example, the ninth booking attempt creates a MEDIUM rule alert even though that factor alone contributes only 5 anomaly points. Rule alerts store `basis: DETERMINISTIC_RULE` and the full `anomalySnapshot`; model alerts store `basis: ANOMALY_MODEL` and every contribution. This distinction prevents presenting a rule priority as a calculated total.

Low scores can be inspected through the live assessment API. They are not persisted as alerts. A low score means the monitored signals are quiet, not that suspicious activity is impossible. The current implementation groups observations by account, not device, network or unidentified passenger; it does not correlate coordinated activity across accounts.

## Persistence and concurrency

`FraudAlert` stores score, severity, explanation (`description`), user/booking/ticket associations, timestamps and JSON evidence (`features`). Evidence includes the model version, observation time, source event ID/type, metrics and contributing factors. Raw QR contents, password hashes and banking credentials are not stored in alerts. Scan logs retain only a fingerprint of the scanned input.

Migration `20260921000900_fraud_monitoring` adds a nullable, unique `dedupeKey` and indexes for account/type/time alerts and account/action/time audit queries. Existing records are preserved.

Booking attempts are committed in a separate transaction before reservation processing so unsuccessful requests remain observable. Creation, cancellation, provider-decline and scan assessments run inside their operation's transaction. Each assessment locks its subject account before counting and checking cooldowns; serializable transactions retry deadlocks. The assessment window is captured after waiting for that lock. A failure to persist a duplicate-use alert rolls back its scan log; the ticket remains used and cannot board again.

The event-based unique key prevents replay from duplicating an alert. Non-duplicate rules have a ten-minute cooldown per account and type. Model alerts have a cooldown per account and severity, so an increase into a new severity band can be reported immediately. Each distinct rejected duplicate presentation creates its own HIGH rule alert, regardless of the cooldown. One event can produce both a rule alert and a model alert because they explain different review signals.

The system evaluates activity when the relevant event occurs. It is not a background scan of every account. Historical alert snapshots remain unchanged as their windows age; the live assessment API recalculates current activity. Monitoring does not introduce automatic penalties or a new booking/payment status.

## Read APIs

All endpoints require an active **ADMIN** session and disable response caching. Passengers and Ticket Officers receive 403; anonymous requests receive 401. They use the existing authentication without adding credentials or secrets.

| Endpoint                                       | Result                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/admin/fraud-alerts`                  | Paginated alerts; optional `type`, `severity`, `status`, `page`, `pageSize` filters |
| `GET /api/admin/fraud-alerts/:id`              | One alert with its explanation and complete contributing evidence                   |
| `GET /api/admin/fraud-alerts/activity/:userId` | Current metrics, score, severity and explanation, including LOW scores              |

Lists default to 20 records and allow at most 50 per page. Unknown query parameters and invalid enum values return 422. Missing alert/account IDs return 404. Responses omit contact details, hashes and ticket tokens. Client-supplied risk scores are not accepted. The later admin review endpoint accepts only review status, a reason and the expected record version. The existing officer page sends bounded, unrecognized QR contents to its verification endpoint for a logged `INVALID` result; it never opens or fetches an external QR URL. The older `/api/tickets/verify` diagnostic remains read-only and is not a boarding scan event.

This phase provides the monitoring service, protected reporting APIs, the administrator dashboard, fraud investigation workflow and audit-log review. Administrators can inspect alert evidence, mark alerts under review, resolve or dismiss them, investigate linked tickets and suspend or reactivate passenger accounts. These operations create redacted audit records; passwords, JWT secrets and complete authentication tokens are never recorded.

## Phase 12 administrator monitoring

The admin dashboard displays passenger, booking, schedule, ticket and open-alert totals. It also displays booking and revenue trends, booking statuses and popular routes from the database. Reports default to the last 30 days and accept ranges up to 93 days in Nigerian time.

The fraud monitoring screen supports severity, type, status and date filters. Alert details include the passenger or responsible officer context, recent bookings, linked ticket, scan history, generated reason, explainable anomaly features and review history. Review actions are concurrency-checked against the alert timestamp and require a 10–1000 character note.

The audit-log screen supports action, entity, actor role and date filters with pagination. Audit metadata is recursively redacted before persistence and display.

## Run and verify

From the repository root, with the existing local configuration preserved:

```powershell
./scripts/mysql.ps1 start
npm.cmd run db:deploy
npm.cmd run db:generate
npm.cmd test
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:fraud
npm.cmd run test:officer
npm.cmd run test:booking
npm.cmd run test:payment
Remove-Item Env:ALLOW_DB_TESTS
```

No new dependency or environment variable is required. Restart an existing backend after generating the Prisma client if it does not reload automatically.

The 11 scoring/rule tests cover severity boundaries, exact trigger thresholds, minimum cancellation samples, deterministic explanations, monotonicity, the 65-point worked example and the 100-point cap. The 15 database/HTTP tests cover rejected and competing booking requests, window boundaries, officer attribution, simultaneous invalid scans, duplicate rejection and original usage timestamps, event replay, provider failures, expiry exclusions, cancellation cohorts, cooldowns, stored evidence, transactional rollback and admin authorization. Fixtures use random identifiers and are removed by their own IDs.

Verified on 21 September 2026:

- **171 automated tests passed:** 40 foundation/validation/recommendation/scoring, 14 authentication, 12 database, 16 admin, 17 booking, 22 payment, 14 ticket, 21 officer and 15 fraud integration tests.
- Production frontend build and Prisma schema validation passed. All nine migrations are applied; the local database is up to date.
- An isolated Edge browser confirmed that five invalid entries create one contextual alert and a used-ticket presentation creates a HIGH alert. Manual verification, boarding, simulated-camera QR decoding, permission denial, camera shutdown, late revocation, network-error recovery and passenger access restrictions passed.
- Existing officer screens passed at 320, 390, 768, 1024 and 1440 pixels with no horizontal overflow or uncaught JavaScript exceptions. Camera verification used a rendered QR video feed; physical camera hardware was not tested.
- The running API returned healthy status; anonymous access to the alert endpoint returned 401. Temporary test records were cleaned up, and local credentials were preserved.

The browser harness initially attempted to select a schedule before its options had loaded. Waiting for the real option and enabled control resolved the test timing issue. No application change was needed for that failure.

## Files and explanation for a project defense

- `server/src/fraud/scoring.js`: pure, reproducible scoring calculation.
- `server/src/fraud/rules.js`: explicit thresholds and review explanations.
- `server/src/fraud/fraud.service.js`: database observations, account locks, transactions and alert deduplication.
- `server/src/routes/fraud.routes.js`: admin-only inspection APIs.
- Booking, payment and officer services: trusted event sources connected to monitoring.
- Prisma schema and ninth migration: persisted evidence and query indexes.
- `server/tests/fraud-scoring.test.js`, `server/tests/fraud.test.js`: unit, integration and concurrency verification.

In a defense: “The rules recognize specific suspicious patterns, while the score combines several weaker signals. Every point has a recorded reason, so a reviewer can reproduce the result. Database transactions keep the event and its alert consistent, and unique event keys prevent duplicate alerts on retries. The system recommends review; it cannot establish a person's intent. Thresholds are explicit academic policies, and measuring false positives and calibrating them against real labelled data would be further work.”
