# RailConnect

## Web-Based Train Transportation Booking and Management System

RailConnect is an academic railway reservation application with explainable train recommendations, electronic tickets, officer boarding verification and fraud monitoring. It addresses fragmented booking records, competing seat reservations, repeated ticket presentation and limited visibility into suspicious activity.

**Schedules, fares, payments and tickets are demonstration data, not official Nigerian Railway Corporation services or records. No real money is collected.**

## Features and user roles

| Role | Implemented capabilities |
| --- | --- |
| Visitor | Responsive public website, database-backed search, explainable recommendations |
| Passenger | Registration/login, visual seat selection, temporary reservation, demo payment, booking history, QR tickets, print/PDF |
| Ticket Officer | Camera/manual entry, schedule-specific validation, boarding confirmation, scan activity, duplicate-use rejection |
| Administrator | Station/route/train/seat/schedule management, booking/payment lists, reports, fraud review, passenger suspension, audit history |

Backend roles and ownership checks protect data independently of frontend navigation. Administrator access does not automatically grant officer boarding permissions.

## Architecture and technology stack

React communicates with an Express JSON API through Axios. Express validates requests, checks sessions and roles, applies service rules and accesses MySQL through Prisma. Transactions protect related booking, payment, boarding and audit writes. Periodic server workers expire seat holds and settle demonstration payments.

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, React Router, Axios, CSS, Lucide, jsQR |
| Backend | Node.js 24.11+, Express 5, Zod, Helmet, bcrypt, JWT, cookie-parser, rate limiting |
| Database | MySQL 8.4, Prisma 7, MySQL-compatible MariaDB driver adapter |
| Ticket output | qrcode, PDFKit, bundled fonts |
| Testing | Node test runner, real MySQL fixtures, Edge/Chromium browser harness |

Exact dependencies are pinned in `package-lock.json`. No trained machine-learning model or Python service is required.

```text
client/src/
  api/                  Axios client
  components/           Shared UI, tables, charts and tickets
  context/              Authentication state
  hooks/                Data fetching and UI hooks
  layouts/              Public, passenger and staff layouts
  pages/                Public, passenger, admin and officer screens
  styles/               Responsive design system
server/
  prisma/               Schema, SQL migrations, seed and verification
  scripts/              Authentication-secret setup
  src/
    config/             Environment and database configuration
    middleware/         Authentication, roles and error handling
    routes/             HTTP endpoints
    validators/         Backend validation
    services/           Authentication, administration, search, reservations
    recommendation/     Normalization, weights and explanations
    payments/           Demo provider, settlement and worker
    tickets/            Validation and ticket output
    officer/            Verification and boarding
    fraud/              Rules, scoring and alerts
    monitoring/         Reports, investigations and audit access
    security/           Request limits and security helpers
    generated/          Generated Prisma client (ignored)
  tests/                Unit, database, API and connected-system tests
scripts/                Local MySQL helper and browser harness
docs/                   Design, flows, test evidence and defense preparation
.local/                 Ignored local database, where prepared
.verification/          Ignored test logs and screenshots
```

## Installation and database setup

Install Node.js **24.11 or newer**, npm and MySQL 8.4. Run commands from the repository root. Examples use Windows PowerShell and `npm.cmd`; other shells can use `npm`.

```powershell
npm.cmd ci
if (!(Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
if (!(Test-Path client/.env)) { Copy-Item client/.env.example client/.env }
```

Create a development database, a separate disposable shadow database and a dedicated database user. Configure `server/.env`. The [database setup guide](server/prisma/README.md) provides provisioning SQL and authentication-key instructions. Never use production data for integration tests or the shadow database.

On this prepared workspace, `./scripts/mysql.ps1 start` starts isolated MySQL on `127.0.0.1:3307`. The helper depends on ignored local binaries/data; it is **not a fresh-checkout MySQL installer**. A fresh checkout can use its own MySQL installation and configured port.

## Environment configuration

The backend loads `server/.env`; Vite loads `client/.env`. Root `.env.example` is a reference, not an active environment file. Preserve existing files and credentials.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL URI; URL-encode reserved password characters |
| `SHADOW_DATABASE_URL` | Separate disposable database for development migration replay |
| `DATABASE_RSA_PUBLIC_KEY_PATH` | Trusted MySQL public key for local password exchange |
| `HOST`, `PORT` | API listener, normally `localhost:5000` |
| `CLIENT_URL` | Exact allowed origins, normally `http://localhost:5173,http://localhost:4173` |
| `NODE_ENV` | Development locally; production enables Secure cookies |
| `JWT_SECRET` | Private signing secret, at least 64 hexadecimal characters |
| `JWT_TTL_SECONDS` | Session lifetime; default 3600 seconds |
| `ALLOW_DEMO_SEED` | Explicit non-production seed opt-in |
| `DEMO_ADMIN_PASSWORD`, `DEMO_OFFICER_PASSWORD`, `DEMO_PASSENGER_PASSWORD` | Passwords for newly created demo accounts |
| `DEMO_START_DATE` | Optional first date for new seed schedules, `YYYY-MM-DD` |
| `ALLOW_DB_TESTS` | Development database test opt-in; normally false |
| `DEMO_PAYMENTS_ENABLED` | Enables the academic payment provider |
| `DEMO_PAYMENT_SCENARIO` | Server-selected `SUCCESS`, `FAILURE` or `FAIL_THEN_SUCCESS` |
| `VITE_API_BASE_URL` | Public client API URL, normally `http://localhost:5000/api` |

Never put secrets in `VITE_` variables: they are included in browser assets. Environment files, local databases and generated artifacts are ignored. MySQL RSA password exchange is not full network encryption; remote deployment needs separately configured and verified TLS.

## Prisma migrations and seed

After configuring MySQL and demonstration passwords:

```powershell
npm.cmd run auth:secret
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd run db:seed
npm.cmd run db:verify
```

`auth:secret` generates a missing secret without printing or replacing an existing value. Seeding requires `ALLOW_DEMO_SEED=true` and refuses production. Demo passwords require at least 8 characters and at most 72 UTF-8 bytes; public registration is stricter.

A fresh seed creates Abuja Idu, Kaduna Rigasa, Lagos Mobolaji Johnson and Ibadan Moniya stations; four directional routes; two trains; 48 seats; 12 schedules; 288 schedule-seat records; and three users. Re-seeding preserves existing passwords and schedule dates. If departures are past, create a future schedule through the admin interface; re-seeding does not refresh existing departures.

Ten committed migrations include custom SQL constraints and ticket triggers. Inspect them with `npm.cmd run db:status --workspace server`. For a new schema change, use `npm.cmd run db:migrate --workspace server -- --name meaningful_change` on a development database with a separate shadow database. Do not substitute `db push` for the migration history.

## Starting frontend and backend

Backend terminal:

```powershell
npm.cmd run dev:server
```

Frontend terminal:

```powershell
npm.cmd run dev:client
```

Open `http://localhost:5173`. Use `localhost` consistently for cookies. `GET http://localhost:5000/api/health` reports API liveness, not database readiness. If port 5000 is occupied, use the existing backend or stop the identified duplicate process. If changing the port, update the client's API URL and restart Vite. Restart the backend after environment changes.

`npm.cmd run build` creates `client/dist`; `npm.cmd run preview --workspace client` previews it. `npm.cmd run start:server` starts the backend without watch mode. Public deployment still needs TLS, secret management and SPA fallback routing.

## Demo accounts

| Role | Email | Password source |
| --- | --- | --- |
| ADMIN | `admin@example.com` | Local `DEMO_ADMIN_PASSWORD` |
| TICKET_OFFICER | `officer@example.com` | Local `DEMO_OFFICER_PASSWORD` |
| PASSENGER | `passenger1@user.com` | Local `DEMO_PASSENGER_PASSWORD` |

Passwords are in ignored `server/.env`. Email is case-insensitive. Changing environment values does not change existing password hashes. Presentation credentials belong only in an isolated demo environment.

## API overview

Paths start with `/api`. Mutations accept validated JSON; browser mutations require the permitted origin and `X-Requested-With: XMLHttpRequest`. Axios includes credentials. Detailed request contracts are linked in the [documentation index](docs/README.md).

| Area | Main endpoints | Access |
| --- | --- | --- |
| Public | `GET /health`, `/stations`, `/routes/popular`, `/schedules/search`, `/schedules/:id/seats` | Public |
| Authentication | `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /auth/me` | Public/session as appropriate |
| Booking/payment | `/bookings`, booking detail/cancellation, `POST /bookings/:id/payments`, payment retrieval | Passenger, own records |
| Tickets | Ticket list/detail/PDF under `/tickets` | Passenger, own records |
| Boarding | `GET /officer/schedules`, `/officer/activity`; `POST /officer/verify`, `/officer/board` | Officer |
| Core management | `/admin/stations`, `/admin/routes`, `/admin/trains`, seat and schedule resources | Admin |
| Reports | `GET /admin/monitoring`, `/admin/bookings`, `/admin/payments` | Admin |
| Investigations | `/admin/fraud-alerts`, review/investigation actions, `/admin/passengers/:id/status` | Admin |
| Audit | `GET /admin/audit-logs` | Admin |

Admin booking/payment lists are read-only. Clients cannot set payment success or arbitrary booking status. Reports use actual records and Africa/Lagos calendar boundaries; revenue represents successful demonstration payments.

## Security controls

- bcrypt cost 12 password hashing; hashes excluded from responses.
- Signed, expiring JWTs in HttpOnly, SameSite=Lax cookies; Secure in production. Database sessions support logout revocation and immediate role/suspension enforcement.
- Backend role/ownership checks, strict validation, explicit CORS, mutation origin/header checks, Helmet, request-size limits and API/auth/payment/scan throttling.
- Prisma queries, database constraints and server-controlled prices, inventory and payment outcomes.
- Random references and QR tokens; no passenger details in QR contents.
- Sanitized audit metadata, generic unexpected-error responses and safe diagnostic codes without raw database messages or credentials.

These controls are not a penetration-test certification. See [authentication](docs/authentication.md).

## Recommendation engine

The multi-criteria engine normalizes fare, departure, duration and available seats across eligible results. Best Overall weights price **35%**, departure **20%**, duration **20%** and availability **25%**, producing a relative 0–100 score. Other preferences emphasize their selected factor. Results include explanations and badges; sold-out options are not recommended. This is deterministic decision support, not trained AI or a prediction of service quality. See [formulas and worked example](docs/recommendations.md).

## Fraud detection and anomaly score

Rules detect used-ticket re-presentation, five invalid scans in ten minutes, more than eight booking attempts in ten minutes, three payment declines in thirty minutes and unusually high cancellation activity with enough history. A separate weighted score yields LOW (0–29), MEDIUM (30–59), HIGH (60–79) or CRITICAL (80–100). Alerts retain reasons and factors for human review; rule priority can differ from calculated anomaly score. The system does not automatically label someone a fraudster or suspend them. See [fraud monitoring](docs/fraud-monitoring.md).

## QR verification and double-booking prevention

Successful server-controlled payment settlement creates one ticket. Its QR contains only a random 32-byte bearer token. The officer selects a schedule, verifies current database state and confirms boarding. An atomic transition marks the ticket USED and records the scan and timestamp. Later presentations are rejected and create HIGH duplicate-use alerts. A copied QR can still be presented first; staff identity checks remain necessary.

Reservations combine a database transaction, conditional seat claim and unique active booking claim. Competing requests for the same schedule-seat produce one success and HTTP 409 for the loser. Holds normally last ten minutes, bounded by departure; expiry releases the seat. See [booking](docs/bookings.md), [tickets](docs/qr-tickets.md) and [officer verification](docs/officer-verification.md).

## Testing commands

```powershell
npm.cmd test
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:all
Remove-Item Env:ALLOW_DB_TESTS
npm.cmd run build
npm.cmd run db:validate --workspace server
npm.cmd run db:status --workspace server
```

`test:all` includes connected-system tests. Individual suites: `test:auth`, `test:admin`, `test:search`, `test:recommendation`, `test:booking`, `test:payment`, `test:ticket`, `test:officer`, `test:fraud`, `test:db`, `test:system`. Run database suites sequentially on a development/test database; fixtures create and clean up their own records. For `test:browser`, start Vite and an isolated Edge debugging profile as described in [system testing](docs/system-testing.md).

See [final verification status](docs/final-status.md) for actual results and the intermittent authentication failure observed in an earlier rerun.

## Known limitations and future improvements

Payments are simulated. There is no real gateway/refund workflow, email verification, password reset or offline boarding. Camera decoding and responsive widths have automated coverage, but physical cameras, Safari/Firefox and physical mobile devices need testing. Local race tests do not establish production performance. Rate-limit state is process-local. Fraud thresholds need real evaluation and are not fraud probabilities. Audit history is append-oriented through APIs, not cryptographically tamper-proof against a database administrator.

Future work: verified gateway webhooks/refunds, identity checks, account recovery, notifications, shared rate-limit storage, production TLS/secrets, backup/restore drills, observability and load/security testing. Governed labelled data could support evaluated machine-learning models alongside explainable rules.

## Documentation and defense

Read the [documentation index](docs/README.md), [architecture](docs/architecture.md), [database relationships](docs/database-relationships.md) and [18-question defense guide](docs/defense-guide.md). These distinguish demonstrated behavior from limitations and future work.
