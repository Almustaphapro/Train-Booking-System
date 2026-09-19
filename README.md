# RailConnect — Train Transportation Booking and Management System

University project: **Design and Implementation of a Secure and Intelligent Web-Based Train Transportation Booking and Management System**.

## Current scope: Phase 1

The frontend and backend foundation is implemented. The frontend has a responsive overview, a live service-status page and a not-found page. The backend exposes a health endpoint with consistent JSON responses, restricted CORS, environment validation and centralized error handling.

Authentication, train search, bookings, payments, tickets, recommendations, fraud detection and database integration are **not implemented yet**. Future features on the overview are explicitly labelled as planned. No live railway data or invented schedules are displayed.

## Prerequisites

- Node.js **24.11 or newer** and npm (verified locally with Node 24.11.1 and npm 11.7.0).
- A modern browser.
- MySQL is not required for Phase 1.

## Install and configure

Run from the repository root. The two applications are npm workspaces, with one root lockfile and shared dependency installation.

```powershell
npm.cmd ci
Copy-Item client/.env.example client/.env
Copy-Item server/.env.example server/.env
```

Copy the environment examples only on first setup; preserve any existing local settings. Use `npm` in shells where it works normally; `npm.cmd` avoids PowerShell script execution-policy issues on Windows. On macOS/Linux, use `cp` instead of `Copy-Item`.

## Run locally

Open two terminals in the repository root.

Backend:

```powershell
npm.cmd run dev:server
```

Frontend:

```powershell
npm.cmd run dev:client
```

- Frontend: http://localhost:5173
- Service status: http://localhost:5173/status
- API health: http://localhost:5000/api/health

The server uses Node's built-in watch mode. Vite provides frontend hot reload. Both development servers bind to localhost by default. Stop each with Ctrl+C.

Alternatively, from `client/` or `server/`, run `npm.cmd run dev`.

## Environment variables

| Location | Variable | Default / purpose |
| --- | --- | --- |
| `client/.env` | `VITE_API_BASE_URL` | `http://localhost:5000/api`; public API URL, including `/api` |
| `server/.env` | `NODE_ENV` | `development`, `test` or `production` |
| `server/.env` | `HOST` | `localhost`; backend bind address |
| `server/.env` | `PORT` | `5000`; validated integer from 1 to 65535 |
| `server/.env` | `CLIENT_URL` | Comma-separated exact origins; `http://localhost:5173,http://localhost:4173` |

The root `.env.example` points to the per-application files; root `.env` is not loaded. Backend configuration loads `server/.env` relative to its module, independent of the launch directory. Process environment values take precedence. Local defaults allow the foundation to run even without `.env` files.

Do not put secrets in `VITE_` variables; Vite includes them in public browser assets. Restart development servers after configuration changes, and rebuild the frontend for changes to production configuration. If you change the API port, update `VITE_API_BASE_URL`. If you change the frontend origin, update `CLIENT_URL` (origins must not end with a slash). Future phases will introduce database and authentication secrets when needed.

## Architecture and folders

```text
.
├── client/
│   ├── public/
│   ├── src/
│   │   ├── api/                 # Shared Axios client and health request
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   ├── passenger/
│   │   │   ├── admin/
│   │   │   └── ticket/
│   │   ├── context/
│   │   ├── hooks/               # Request state and cancellation
│   │   ├── layouts/             # Shared public navigation and footer
│   │   ├── pages/
│   │   │   ├── public/          # Overview, status, not found
│   │   │   ├── passenger/
│   │   │   ├── admin/
│   │   │   └── officer/
│   │   ├── styles/              # Design tokens and responsive CSS
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── prisma/                 # Reserved for Phase 2; see README
│   ├── src/
│   │   ├── config/             # Environment validation and CORS
│   │   ├── controllers/
│   │   ├── middleware/         # Not-found and centralized errors
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── validators/
│   │   ├── security/
│   │   ├── recommendation/
│   │   ├── fraud/
│   │   ├── app.js              # HTTP middleware and routes
│   │   └── server.js           # Listener and shutdown lifecycle
│   ├── tests/foundation.test.js
│   ├── .env.example
│   └── package.json
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

Empty future-phase directories contain `.gitkeep` files so the agreed structure survives version control. No future business functionality is scaffolded into working routes.

The request flow is **React page → health hook → Axios → Express route → controller → JSON response**. React Router provides `/`, `/status` and a fallback route. The shared Axios client has an API base URL and a 10-second timeout. The status hook cancels obsolete requests, supports retry, and handles loading, success and failure.

The CSS system defines colors, spacing, border radii, typography and surfaces centrally in `tokens.css`. Shared layout and component classes live in `global.css`, with keyboard focus indicators, a skip link, responsive breakpoints and accessible status announcements. Icons use Lucide; the decorative rail artwork is CSS.

## Dependencies

- Client runtime: `react`, `react-dom`, `react-router`, `axios`, `lucide-react`.
- Client build tooling: `vite`, `@vitejs/plugin-react`.
- Server runtime: `express`, `cors`, `dotenv`.
- Backend tests and watch mode: built into Node.js; no additional packages.

Exact installed versions are recorded in `package-lock.json`. Prisma, authentication, QR and payment packages are deferred until required.

## API and error behavior

`GET /api/health` returns HTTP 200:

```json
{
  "success": true,
  "message": "API is running.",
  "data": {
    "status": "ok",
    "service": "RailConnect API",
    "timestamp": "<current ISO timestamp>",
    "uptimeSeconds": 0
  }
}
```

The timestamp and uptime reflect the running process. The endpoint is a liveness check; it does not verify a database or future business services. Responses disable caching.

Unknown endpoints return 404. Disallowed browser origins return 403. Invalid JSON returns 400, oversized bodies return 413, and unexpected errors return 500 without stack traces or internal messages. CORS allows the configured origins and health-check methods; requests without `Origin` are permitted for command-line and server clients. CORS is not authentication. Methods will be expanded when write endpoints are introduced.

## Verify

```powershell
npm.cmd test
npm.cmd run build
Invoke-RestMethod http://localhost:5000/api/health | ConvertTo-Json -Depth 4
```

The backend tests cover health output, CORS and preflight, unknown routes, malformed JSON, body-size limits, safe asynchronous error handling, and invalid environment configuration. To verify browser communication, open `/status`: it must display **Service is online** and the last-check time. Stop the backend and click **Check again** to verify the unavailable state, then restart it and retry.

### Phase 1 verification results

Verified on 19 September 2026:

- Production frontend build passed.
- All 10 backend tests passed.
- Both development servers started successfully.
- A real headless Edge browser received HTTP 200 from the API through the frontend Axios request.
- The unavailable state and retry recovery passed with the health request temporarily blocked in the verification browser.
- Direct `/status` reloads, the not-found page and its return link passed.
- No uncaught browser JavaScript exceptions or horizontal page overflow were found at 320, 390, 768 and 1440 pixels; desktop and mobile screenshots were also reviewed.
- npm reported zero known vulnerabilities during installation.

The coding environment initially blocked npm network access and Windows subprocesses (`spawn EPERM`). Installation, build, tests and development servers succeeded using authorized execution outside that sandbox. These were environment restrictions rather than application defects. Browser verification uses an isolated local profile; temporary screenshots and tooling are ignored under `.verification/`.

To preview the production frontend build locally:

```powershell
npm.cmd run build
npm.cmd run preview --workspace client
```

Open http://localhost:4173; keep the backend running. For the backend without file watching, run `npm.cmd run start:server`. A future frontend deployment must route unknown document paths to `index.html` so React Router deep links work. The API must be hosted separately and its URL supplied at frontend build time.

## Troubleshooting and phase boundary

- **Port in use:** stop the conflicting service or change the port and matching frontend/CORS configuration. Vite uses `strictPort` to avoid silently choosing an unapproved origin.
- **Status unavailable:** confirm the backend is running, check `VITE_API_BASE_URL`, and ensure the browser origin is in `CLIENT_URL`. Use `localhost` consistently rather than mixing it with `127.0.0.1`.
- **Invalid configuration:** the backend stops with a specific variable-validation error before listening.
- **Package installation:** registry access is required for the initial dependency install; local network policies may require permission.

Next phase: **Phase 2 — Database**, including Prisma/MySQL setup, schema, migrations and seed data. Phase 2 has not begun. There are no database setup commands, demo accounts or credentials yet. Production security hardening and authentication remain later-phase work.

Framework references: [Vite guide](https://vite.dev/guide/), [React Router declarative setup](https://reactrouter.com/start/declarative/installation), [Express error handling](https://expressjs.com/en/guide/error-handling/).

# Phase 1 file inventory

The workspace was initially empty. All files below were created during Phase 1; no existing work was overwritten. Local `.env` files are ignored by Git. Build output, installed packages and temporary verification artifacts are excluded.

```text
.env.example
.gitignore
client\.env
client\.env.example
client\index.html
client\package.json
client\public\favicon.svg
client\src\api\client.js
client\src\api\health.js
client\src\App.jsx
client\src\assets\.gitkeep
client\src\components\admin\.gitkeep
client\src\components\common\Brand.jsx
client\src\components\passenger\.gitkeep
client\src\components\ticket\.gitkeep
client\src\context\.gitkeep
client\src\hooks\useHealth.js
client\src\layouts\PublicLayout.jsx
client\src\main.jsx
client\src\pages\admin\.gitkeep
client\src\pages\officer\.gitkeep
client\src\pages\passenger\.gitkeep
client\src\pages\public\HomePage.jsx
client\src\pages\public\NotFoundPage.jsx
client\src\pages\public\StatusPage.jsx
client\src\styles\global.css
client\src\styles\tokens.css
client\src\utils\.gitkeep
client\vite.config.js
package.json
package-lock.json
README.md
server\.env
server\.env.example
server\package.json
server\prisma\README.md
server\src\app.js
server\src\config\cors.js
server\src\config\env.js
server\src\controllers\health.controller.js
server\src\fraud\.gitkeep
server\src\middleware\errorHandler.js
server\src\middleware\notFound.js
server\src\recommendation\.gitkeep
server\src\routes\index.js
server\src\security\.gitkeep
server\src\server.js
server\src\services\.gitkeep
server\src\utils\ApiError.js
server\src\validators\.gitkeep
server\tests\foundation.test.js
```
#   T r a i n - B o o k i n g - S y s t e m  
 