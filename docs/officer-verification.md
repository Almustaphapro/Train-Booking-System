# Phase 10 — Ticket Officer and QR Verification

Ticket Officers have a working dashboard at `/officer/dashboard` and a boarding workspace at `/officer/verify`. The workspace supports camera QR scanning and manual entry of either the secure QR token or the printed ticket number. Demonstration tickets remain academic project data and are not valid for real railway travel.

## Try the workflow

Run the existing frontend and backend in separate terminals if they are not already running:

```powershell
npm.cmd run dev:server
npm.cmd run dev:client
```

MySQL must be running. For a fresh checkout, apply all migrations and regenerate the Prisma client:

```powershell
./scripts/mysql.ps1 start
npm.cmd run db:deploy
npm.cmd run db:generate
```

1. Complete a successful demo payment as a passenger and open the generated ticket.
2. Sign in with the existing Ticket Officer demo account. Use a separate browser profile if you want the passenger ticket and officer session open simultaneously.
3. Open **Verify tickets** or `http://localhost:5173/officer/verify`.
4. Select the departure date and the actual train/schedule being boarded. Dates and times use Africa/Lagos (WAT).
5. Start the camera and present the whole ticket QR, or type/paste its `TKT-...` ticket number or 64-character QR token.
6. For **VALID TICKET**, check the displayed passenger name, train, route, departure and seat, then press **Confirm Boarding** within two minutes.
7. The result becomes **BOARDING CONFIRMED**. Reusing the ticket shows **TICKET ALREADY USED**, including its original boarding timestamp.

The dashboard shows the signed-in officer's confirmed boardings, valid checks, rejected checks and latest 20 activity records for the current WAT day. Counts come from actual database logs; no demonstration totals are hardcoded.

## Boarding rules

Every verification checks the current ticket, booking, matching successful payment, seat reservation, expiry, schedule and prior usage. The selected schedule must match the ticket's schedule. A schedule must be `SCHEDULED` or `BOARDING`, and its departure and arrival must still be in the future. `CANCELLED`, `COMPLETED`, `DEPARTED` and already-departed schedules cannot be boarded.

This phase has no fixed opening window such as “30 minutes before departure”; officers explicitly select the departure. The two-minute limit is the lifetime of a successful verification, not the train's boarding window. Ticket expiry/arrival and the schedule's departure cutoff are enforced using server time.

An already-used ticket always returns the original usage timestamp, including after its journey has ended. Unknown tokens/numbers, cancelled/expired tickets, wrong schedules and invalid payment/booking/seat states cannot produce a usable confirmation ID. Recognized tickets expose only the passenger name, ticket number, train, route, times, seat/class and demonstration label—no contact details, password hash, fare, payment reference or QR token.

## API contracts

All `/api/officer` operations require an active `TICKET_OFFICER` session. Passengers and admins receive 403; anonymous requests receive 401. Admin access to the older read-only `/api/tickets/verify` endpoint does not grant boarding access.

| Endpoint | Request | Purpose |
| --- | --- | --- |
| `GET /api/officer/schedules?date=YYYY-MM-DD` | Valid WAT date | Real schedules for the selected day, with current boarding eligibility |
| `GET /api/officer/activity` | No body | Own daily counts and latest activity |
| `POST /api/officer/verify` | `{ "entry": "<token or TKT-number>", "scheduleId": "<id>" }` | Validate and record a scan/check |
| `POST /api/officer/board` | `{ "verificationId": "<successful check id>" }` | Recheck and consume the ticket atomically |

POST endpoints require the existing JSON/custom-header/origin checks and share a limit of 120 requests per minute per officer account. Input is strict: fields such as `usedAt`, ticket/booking status, arbitrary passenger IDs and schedule overrides on confirmation are rejected. Responses disable caching and referrer disclosure.

Verification returns HTTP 200 with a decision: `VALID`, `ALREADY_USED`, `INVALID`, `CANCELLED`, `EXPIRED`, `WRONG_SCHEDULE` or `SCHEDULE_CLOSED`. `VALID` includes `verificationId`, `confirmBefore` and `checkedAt`. Only the officer who created that successful verification can confirm it.

Boarding succeeds with HTTP 200 and `status: BOARDED`. A changed/used/expired ticket or expired verification returns HTTP 409 with the current decision. `VERIFICATION_EXPIRED` requires a fresh check. Missing, unsuccessful or another officer's verification ID returns 404. Invalid request shapes, empty entries and entries over 2048 characters return 422. Nonempty unrecognized QR contents return a logged `INVALID` decision, allowing Phase 11 to observe repeated attempts. Unknown schedules return 404.

The frontend clears outdated decisions on new input, changed schedule or request failure. It disables confirmation after the two-minute deadline. If a network response is lost during boarding, verify again; the server reports the actual used state.

## Transactions and logs

Verification creates a `TicketScanLog` containing officer ID, matched ticket ID if any, selected schedule ID, decision, reason, IP address and timestamp. It stores only a SHA-256 fingerprint of the normalized entry, with a token/number prefix to distinguish the two forms. Raw tokens and camera frames are never stored in logs.

Boarding uses a serializable transaction with deadlock retry. It reloads the officer-owned verification and all current eligibility records. A conditional update changes only a `VALID` ticket with no `usedAt` timestamp to `USED`. The same transaction sets server-generated `usedAt`, writes a `BOARDED` scan log and a `TICKET_BOARDED` audit entry. If either log fails, ticket usage rolls back.

When two officers confirm the same ticket simultaneously, one succeeds; the other receives HTTP 409 and the original used timestamp. The rejected repeat is recorded as `ALREADY_USED`. Verification never changes unrelated booking, payment or seat data. Officers have no administrative management controls.

Migration `20260921000800_officer_verification` adds nullable `TicketScanLog.scheduleId`, its index and restrictive foreign key to `Schedule`. Older logs are preserved with a null schedule; they cannot be used as boarding authorizations. The existing schema already supports `Ticket.usedAt` and scan results `VALID`, `BOARDED`, `ALREADY_USED`, `INVALID`, `EXPIRED`, `CANCELLED`, `REJECTED`.

## Camera behavior

The QR decoder (`jsqr`, already used by ticket tests) is now a client runtime dependency. It loads only when the camera is started. Camera frames are decoded on the device and only the decoded entry is sent to the API. No microphone is requested, no frame is uploaded and no decoded token is saved to browser storage.

The scanner stops after one QR, on **Stop camera**, when the page is hidden and when leaving the verification page. Cleanup also stops a stream if permission is granted after the scanner has already closed. Permission denial, a missing/in-use camera and an unsupported browser show a manual-entry alternative. Unrecognized QR contents are rejected; no external QR URL is opened or fetched.

Camera access requires a secure context and browser permission. Localhost works for development; opening a plain HTTP LAN address on a phone generally does not. Use HTTPS for deployment/device testing. See [MDN getUserMedia documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Verification commands

Use a non-production database:

```powershell
$env:ALLOW_DB_TESTS='true'
npm.cmd run test:officer
npm.cmd run test:ticket
npm.cmd run test:booking
npm.cmd run test:payment
npm.cmd run test:auth
npm.cmd run test:admin
npm.cmd run test:db
npm.cmd test
npm.cmd run build
```

The officer suite contains 21 tests covering both entry methods, roles, CSRF, strict input validation, limited disclosure, scan logs, unknown/unpaid tickets, wrong schedules, all ticket states, schedule closure, repeated use, original timestamps, stale verification, ownership, late revocation, simultaneous boarding, unchanged booking/payment/seat data, logging rollback and officer-specific activity.

Verification passed **145 automated tests**: 21 officer, 14 ticket, 17 booking, 22 payment, 14 authentication, 16 admin, 12 database and 29 foundation/validation/recommendation tests. The eighth migration was applied successfully.

An isolated Edge browser passed manual entry, green verification, boarding, original used timestamps, permission denial, QR decoding, camera shutdown, late cancellation, network-error recovery, login redirects and passenger rejection. Ready, valid, boarded, already-used and dashboard screens passed at 320, 390, 768, 1024 and 1440 pixels with no page overflow or uncaught exceptions. Camera tests used a real ticket QR rendered into a simulated video stream; a physical camera was not tested. All temporary database fixtures were cleaned up.

The browser checks found and fixed a cleanup error when permission was denied before a camera stream existed. The QR decoder is split into its own downloaded chunk so ordinary passenger pages do not load the scanner library.

## Main files

- `server/src/officer/officer.service.js`, `server/src/routes/officer.routes.js`: verification, confirmation, schedules and activity.
- `server/prisma/schema.prisma`, migration `20260921000800_officer_verification`: schedule-linked scan logs.
- `server/src/tickets/ticket.service.js`: shared current-validity rules and relation selection.
- `client/src/pages/officer/{OfficerDashboard,OfficerVerifyPage}.jsx`, `client/src/components/ticket/CameraScanner.jsx`, `client/src/styles/officer.css`: officer interface and camera lifecycle.
- App routes, navigation and the role-specific return-path helper link the workflow into existing authentication.
- `server/tests/officer.test.js` and root/server `test:officer` scripts: repeatable integration and concurrency tests.

No new secret or environment variable is required. Existing `.env` settings and demo credentials were preserved.

Phase 11 now adds [fraud rules and explainable anomaly scoring](fraud-monitoring.md). Each rejected duplicate presentation stores a HIGH alert in the scan transaction; repeated invalid scans produce contextual alerts. The verification results above describe Phase 10. Real payment integration remains deferred, and Phase 12 has not started.
