# Phase 9 — QR ticket generation

Passengers can view electronic tickets, open **My Tickets**, print a ticket and download a PDF. Every ticket includes passenger name, booking reference, ticket number, train, origin, destination, departure date/time, arrival date/time, seat, class, paid fare, current status and a QR code. All journey times use **Africa/Lagos (WAT)**. Demo tickets are clearly labelled academic demonstrations and are not valid for real travel or official NRC data.

## Try the passenger flow

Keep the existing development servers running, or start them in separate terminals from the repository root:

```powershell
npm.cmd run dev:server
npm.cmd run dev:client
```

Do not start a second copy on a port that is already in use. MySQL must also be running (`./scripts/mysql.ps1 start`).

1. Sign in as a passenger at `http://localhost:5173`.
2. Search a future demonstration schedule, select a seat, review and reserve it.
3. Complete demo payment within the seat hold. The default server scenario is `SUCCESS`; `FAILURE` intentionally produces no ticket.
4. Follow **View ticket & QR code** from the payment receipt or booking details, or open **My Tickets** in the navigation/dashboard.
5. Use **Print ticket** for the browser print dialog or **Download PDF** for a standalone PDF.

Previously paid Phase 8 bookings work too. An empty ticket list is normal for an account that has not successfully paid. If seeded schedules are in the past, create a future demonstration schedule through the admin workspace.

## How it works

The existing payment service remains the only ticket issuance path. Its serializable database transaction verifies payment, changes the payment to `PAID`, confirms the booking, marks the schedule seat `BOOKED`, inserts one ticket and records audit events. If ticket storage fails, all these changes roll back. A database trigger additionally rejects ticket insertion without a confirmed booking and a matching paid payment (same amount and currency).

The ticket number is unique. The QR token uses `crypto.randomBytes(32)`, encoded as 64 hexadecimal characters: 256 bits of randomness. Both fields and the booking-to-ticket relation have database uniqueness constraints. Payment retries and ticket downloads reuse the same ticket and token.

The QR image encodes **only that opaque token**. It contains no passenger name, email, phone, booking reference or fare. No token appears in a URL. The passenger API returns a PNG data URL for the owner's ticket; it does not return a separate raw-token field. The PNG itself necessarily contains the token, so the ticket should be kept private. QR generation and PDF rendering happen locally on the backend, without external QR services.

An image or saved PDF cannot prove current validity. The server looks up the token and checks the current ticket, booking, payment, schedule and seat reservation together. The Phase 9 `/api/tickets/verify` endpoint remains read-only and cannot authorize boarding. Phase 10 adds the separate [officer verification and boarding workflow](officer-verification.md), with schedule-bound scan logs and transactional ticket usage.

## API

All endpoints require a valid session cookie and send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

| Endpoint | Access | Result |
| --- | --- | --- |
| `GET /api/tickets?page=1&pageSize=10` | Passenger | Own tickets, current statuses and pagination; no QR images in the list |
| `GET /api/tickets/:id` | Owning passenger | Ticket fields, PNG QR image and server check time |
| `GET /api/tickets/:id/download` | Owning passenger | PDF attachment with ticket fields and QR |
| `POST /api/tickets/verify` | Admin or Ticket Officer | Read-only current validity for `{ "token": "<64 lowercase hex characters>" }` |

Another passenger's ticket/download returns 404. Anonymous access returns 401; disallowed roles return 403. Pagination accepts page 1–100000 and page size 1–50. Verification requires the existing JSON/custom-header/origin protection and is limited to 60 requests per minute per IP. As with the existing authentication limiter, multi-instance deployment would need shared rate-limit storage and correctly configured proxy trust.

Verification rejects malformed or extra input fields with 422. A well-formed unknown token returns HTTP 200 with `valid: false` and `status: INVALID`. Recognized tokens return `valid`, `status`, `message`, `ticketNumber`, `isDemo` and `checkedAt`, with no passenger details or token echoed. Even a `VALID` demo ticket is only valid within the academic simulation.

There is no passenger endpoint to issue tickets, change ticket status or declare a payment successful.

## Status rules

These are **effective statuses**, calculated on each server read. For example, a stored `VALID` ticket whose expiry has passed is returned as `EXPIRED` without waiting for a worker. Status does not depend on the browser's clock.

| Status | Meaning |
| --- | --- |
| `VALID` | Ticket is valid, booking is confirmed, a matching successful payment exists, its active seat is booked, and the journey/ticket has not expired or been cancelled |
| `USED` | Stored ticket is used or has a used timestamp; cannot validate again |
| `CANCELLED` | Ticket/booking/schedule cancelled, payment no longer paid or matching payment missing, or no confirmed active booked seat |
| `EXPIRED` | Expiry/arrival has passed, ticket was explicitly expired, or booking/schedule is expired/completed |

Cancellation/payment revocation is checked first, then use, then expiry, then the confirmed-seat invariant. Used/cancelled/expired tickets stay in the owner's archive with their status clearly shown. A previously downloaded QR is rejected when its current database state becomes invalid. Unrelated station/train deactivation does not itself revoke an already paid ticket; cancellation of its schedule does.

The passenger pages refresh current status every 15 seconds. A read error hides the old ticket rather than showing a stale valid badge. Printed/downloaded status is a dated snapshot and is labelled accordingly. Phase 10 now implements [officer scanning, ticket consumption and duplicate-use handling](officer-verification.md). Phase 11 adds [fraud monitoring](fraud-monitoring.md), including alerts for rejected duplicate presentations. Refund workflows remain deferred.

## Files and dependencies

- `server/src/tickets/ticket.service.js`: owner-scoped DTOs, QR generation, current-state validation.
- `server/src/tickets/ticket.pdf.js`: PDF layout and font embedding.
- `server/src/tickets/fonts/`: locally bundled Noto Sans regular/bold plus OFL license and source notes.
- `server/src/routes/ticket.routes.js`, `server/src/app.js`: protected ticket APIs.
- `server/src/services/booking.service.js`: safe ticket ID added to booking responses for navigation.
- `client/src/components/ticket/TicketDocument.jsx`: shared ticket design and status badge.
- `client/src/pages/passenger/{MyTicketsPage,PassengerTicketPage}.jsx`: list, detail, print and download.
- `client/src/styles/ticket.css`: responsive and print styles.
- App routes, main CSS import, passenger navigation/dashboard, booking details, payment page and login return-path allowlist link the new pages.
- `server/tests/ticket.test.js`, package scripts/lockfile and guides document and verify the feature.

Added runtime dependencies: `qrcode` 1.5.4 and `pdfkit` 0.20.2. Test-only dependencies: `jsqr` 1.4.0 and `pngjs` 5.0.0 to decode the actual generated QR image. No frontend dependencies, new environment variables or schema migrations were needed. Existing ticket fields, constraints and issuance trigger already support this phase.

The [QR library documentation](https://github.com/soldair/node-qrcode#readme) describes image generation/error correction. The implementation uses a four-module quiet zone and high error correction. [PDFKit's font documentation](https://pdfkit.org/docs/text.html#fonts) explains font embedding; local Noto Sans fonts render the naira symbol and accented Latin names without relying on a viewer's installed fonts.

## Verification

Use a non-production MySQL database and run from the root:

```powershell
$env:ALLOW_DB_TESTS='true'
npm.cmd run test:ticket
npm.cmd run test:payment
npm.cmd run test:booking
npm.cmd run test:auth
npm.cmd test
npm.cmd run build
```

Phase 9 verification passed **96 automated tests**: 14 ticket, 22 payment, 17 booking, 14 authentication and 29 foundation/validation/recommendation tests. Ticket tests cover unpaid/failed issuance rejection (including direct database attempts), forged paid flags, owner isolation, roles, CSRF, QR decoding/privacy, PDF generation, unknown tokens, all four statuses, expiry, refund/seat/schedule revocation, pagination and uniqueness. Existing tests also verify concurrent reservations/payments and atomic rollback if ticket creation fails.

An isolated Edge browser completed payment → ticket, My Tickets and individual-ticket login redirects, PDF download, print layout, status changes and error recovery. Empty, list and detail pages were checked at 320, 390, 768, 1024 and 1440 pixels with no page overflow or uncaught JavaScript exceptions. Fixtures were removed after verification. Build tooling required the existing Windows subprocess permission; no application failure remains from that restriction.

**Phases 10 and 11 are implemented separately; Phase 12 has not been started.**
