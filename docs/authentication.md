# Phase 3 — Authentication and authorization

Passenger registration, email/password login, logout, current-user lookup and role-protected dashboards are implemented. Phase 4 expands the admin dashboard into the [core management workspace](admin-management.md), reusing this authentication. Phase 5 adds [public train search](public-search.md), which does not require login; Phase 6 adds [explainable recommendations](recommendations.md). Phase 7 adds [passenger seat reservations and My Bookings](bookings.md), followed by [Phase 8 demo payments](demo-payments.md). Login/registration can return passengers to an allowlisted same-app booking, payment or ticket destination; other roles retain their dashboard redirects. Phase 9 adds [owner-protected QR tickets and PDFs](qr-tickets.md). Real gateway processing and officer scanning are not implemented.

## Start the existing workspace

Run from the repository root:

```powershell
./scripts/mysql.ps1 start
npm.cmd run auth:secret
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd run dev:server
```

In another terminal:

```powershell
npm.cmd run dev:client
```

Open <http://localhost:5173/login> or <http://localhost:5173/register>. Use `localhost` consistently for both applications. For a fresh checkout, first run `npm.cmd ci`, copy the per-application `.env.example` files only if their `.env` files do not exist, and follow the [database setup](../server/prisma/README.md). Do not overwrite existing secrets or reset the database.

`auth:secret` creates a cryptographically random signing secret when missing. It preserves an existing nonempty value and never prints the secret. The backend refuses to start with a missing or invalid secret.

| Backend variable | Purpose |
| --- | --- |
| `JWT_SECRET` | At least 64 hexadecimal characters, generated locally; never a `VITE_` variable |
| `JWT_TTL_SECONDS` | Session lifetime, default 3600 seconds; range 300–86400 |
| `NODE_ENV` | `production` enables Secure cookies; HTTPS is required |
| `CLIENT_URL` | Exact permitted frontend origins, comma-separated |
| `DATABASE_URL` | Existing MySQL connection; preserve local credentials |

The existing demonstration accounts are `passenger1@user.com`, `admin@example.com` and `officer@example.com`. Their passwords are the corresponding `DEMO_PASSENGER_PASSWORD`, `DEMO_ADMIN_PASSWORD` and `DEMO_OFFICER_PASSWORD` values in ignored `server/.env`. These local demonstration accounts use simplified presentation credentials; public registration retains the stronger password rules below. Email login is case-insensitive, so `Passenger1@user.com` also works. Changing environment variables alone does not change already-seeded password hashes. All schedules and fares remain demonstration data, not official Nigerian Railway Corporation data.

## API contract

All authentication responses use `Cache-Control: no-store`. JSON responses contain safe user fields and never contain password hashes or JWTs. Browsers receive the JWT only through the HttpOnly cookie.

| Method and path | Access | Result |
| --- | --- | --- |
| `POST /api/auth/register` | Public | 201, creates a passenger and signs them in |
| `POST /api/auth/login` | Public | 200, starts a session |
| `POST /api/auth/logout` | Public/idempotent | 200, revokes the presented session and clears its cookie |
| `GET /api/auth/me` | Authenticated | 200, current safe account information |
| `GET /api/passenger/dashboard` | PASSENGER only | 200, safe account information |
| `GET /api/admin/dashboard` | ADMIN only | 200, safe account information |
| `GET /api/officer/dashboard` | TICKET_OFFICER only | 200, safe account information |

Every authentication POST requires `Content-Type: application/json` and `X-Requested-With: XMLHttpRequest`. The shared Axios client supplies these headers and `withCredentials: true`. An API client must retain the response cookie and send it on subsequent requests.

Registration body:

```json
{
  "fullName": "Example Passenger",
  "email": "passenger@example.test",
  "phone": "08012345678",
  "password": "<your private password>",
  "confirmPassword": "<the same password>"
}
```

Login accepts only `email` and `password`; logout accepts `{}`. Registration rejects unknown fields such as `role`, so public users cannot assign themselves administrative access.

Names must contain 2–150 characters without control characters. Emails are validated, trimmed and lowercased. Phone numbers are normalized: Nigerian local numbers such as `08012345678` become `+2348012345678`; international numbers require a leading `+` and 8–15 digits. Passwords require at least 12 characters, uppercase, lowercase, a digit and a symbol, with a maximum of 72 UTF-8 bytes to avoid bcrypt truncation. Confirmation must match exactly. Password characters are not silently trimmed.

Invalid fields produce HTTP 422 with a `fields` map. Duplicate email or normalized phone produces a generic 409, including simultaneous duplicate submissions. Wrong passwords, unknown emails and inactive accounts all produce the same 401 message: `Invalid email or password.` Anonymous protected requests return 401; authenticated requests with the wrong role return 403. Rate-limited requests return 429 with retry information. Internal failures return safe errors without database details or stack traces.

## Roles and frontend routing

| Role | Redirect after login | Permitted role API |
| --- | --- | --- |
| PASSENGER | `/passenger/dashboard` | `/api/passenger/dashboard` |
| ADMIN | `/admin/dashboard` | `/api/admin/dashboard` |
| TICKET_OFFICER | `/officer/dashboard` | `/api/officer/dashboard` |

Each role is limited to its own dashboard. There is no implicit administrator override. Phase 4 management pages and all their CRUD APIs are ADMIN-only. React guards redirect anonymous visitors to `/login` and wrong-role visitors to `/unauthorized`; Express independently enforces the same permissions. Hiding a frontend link alone would not secure an API.

The frontend loads `/api/auth/me` on startup and rechecks when the window regains focus. Loading and service-error states have explicit UI. Successful logout clears frontend account state; failed logout leaves the account visible with a retry message. Password fields have accessible labels, validation messages and visibility toggles.

## Security design and project defense

1. **Passwords:** bcrypt cost 12 produces salted hashes. Login compares hashes, and unknown users still perform a dummy bcrypt comparison. Responses select an explicit list of safe User fields.
2. **JWT:** tokens use HS256 with a restricted verification algorithm, issuer, audience, expiry, user ID (`sub`) and session ID (`jti`). A role is not trusted from token claims.
3. **Sessions:** the incremental `20260920000400_auth_sessions` migration adds `AuthSession`. One user can have many sessions. Each protected request verifies the signature and loads the session and current User from MySQL. Expired sessions and inactive accounts fail immediately. A role change applies to existing sessions on their next request.
4. **Logout:** deleting the session invalidates replay of its otherwise-unexpired JWT. Other devices retain their own sessions. Expired sessions are pruned for that user when creating another session; request-time expiry checks do not depend on cleanup.
5. **Cookies:** `HttpOnly`, host-only, `SameSite=Lax`, `Path=/api`, with a lifetime matching the session. Production also uses `Secure` and the `__Secure-railconnect_session` name. Tokens are never stored in localStorage or returned in JSON.
6. **CSRF and CORS:** exact trusted origins, credentialed CORS, a required custom header and JSON body, and rejection of cross-site Fetch Metadata requests protect authentication mutations. The custom header forces browser preflight. Future cookie-authenticated write routes must reuse these protections.
7. **Abuse controls:** Helmet adds HTTP security headers. Login allows 10 failed requests per IP per 15 minutes; successful requests are excluded. Registration allows 5 attempts per IP per hour. Request bodies are limited to 16 KB.
8. **Audit trail:** successful registration, login and logout write `AUTH_REGISTER`, `AUTH_LOGIN` and `AUTH_LOGOUT` audit events transactionally with the corresponding database changes. Passwords, cookies and tokens are not recorded in audit metadata.

The session table is intentionally stateful: a signed JWT proves that the server issued a token, while the database determines whether that session is still allowed. This makes immediate logout revocation possible without waiting for JWT expiry. Its user foreign key cascades on user deletion; indexes support per-user session and expiry lookup. No existing domain records were reset.

## Verification

Use only the development database for integration tests:

```powershell
npm.cmd test
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:auth
npm.cmd run test:db
Remove-Item Env:ALLOW_DB_TESTS
npm.cmd run build
```

Verified on 20 September 2026:

- All four migrations are applied; Prisma reports the schema is up to date. Demonstration records and password checks passed verification, and the live health endpoint returned HTTP 200 with `status: ok`.
- 14 foundation/validation/configuration tests passed.
- 14 authentication integration tests passed against MySQL: registration, bcrypt storage, duplicate email/phone, concurrent duplicate registration, field validation and role injection, valid login, wrong/unknown/inactive login, anonymous denial, all nine role/endpoint combinations, immediate role/status changes, forged/expired/wrong-audience/wrong-algorithm JWTs, logout replay rejection, database session expiry, CSRF, credentialed preflight, Helmet and rate limiting.
- All 12 existing database integration tests passed; frontend production build passed.
- Real headless Edge checks passed for registration, password confirmation errors, each role's login redirect, wrong-password UI, passenger/officer admin denial, session reload, logout, anonymous redirects and frontend-to-backend health communication.
- Cookie attributes were inspected in the browser. No token was placed in localStorage.
- Login, registration and dashboard had no horizontal overflow at 320, 390, 768 and 1440 pixels. Desktop/mobile screenshots were reviewed. No uncaught browser JavaScript exceptions were observed.
- Temporary test users, sessions and audit fixtures were removed. Local browser screenshots and tooling are ignored under `.verification/`.

## Deployment limits

Production requires HTTPS and frontend/API hosting on the same site because the cookie uses `SameSite=Lax`; different ports on localhost work for development. Do not switch to cross-site cookies without reviewing CSRF and browser cookie restrictions. Configure frontend document fallback to `index.html` for React Router deep links.

The rate-limit store is in memory and intended for this single-process phase. A multi-instance deployment requires shared rate-limit storage. Express currently does not trust proxy-provided IP addresses; configure an exact trusted proxy topology before deploying behind a proxy. Rotate `JWT_SECRET` through deployment secret management when necessary; doing so invalidates all previously signed tokens.

Password reset, email verification, refresh tokens, account-management screens and later booking/ticket workflows are outside this phase.

## Files added or changed

- `server/prisma/schema.prisma` and `migrations/20260920000400_auth_sessions/`: session relation, table and indexes.
- `server/src/config/auth.js`, `security/`, `validators/auth.validators.js`, `middleware/auth.js`, `middleware/authMutationGuard.js`: token configuration, validation and protection.
- `server/src/services/auth.service.js`, `controllers/auth.controller.js`, `routes/auth.routes.js`, `routes/dashboard.routes.js`: authentication and basic role endpoints.
- `server/src/app.js`, `server.js`, `config/cors.js`, `middleware/errorHandler.js`: middleware wiring, graceful database shutdown, credentialed CORS and safe validation errors.
- `server/scripts/auth-secret.js`, `server/.env.example`, ignored local `server/.env`: secret setup and documented settings.
- `server/tests/auth.test.js`, `auth-validation.test.js`: authentication integration and validation/configuration checks.
- `client/src/api/`, `context/AuthContext.jsx`, `utils/roles.js`, `components/common/`: API calls, session state, route guards, forms, navigation and dashboard components.
- `client/src/pages/public/`, `pages/passenger/`, `pages/admin/`, `pages/officer/`, `App.jsx`, `layouts/PublicLayout.jsx`, `main.jsx`, `styles/auth.css`: authentication pages, role dashboards, routing and responsive styling.
- Root/server `package.json` and root `package-lock.json`: scripts and required dependencies (`cookie-parser`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `zod`; existing bcrypt reused).
- Root/database README files and this guide: current scope, setup and verification.
