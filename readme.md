# NexusFlow — Visual IoT Telemetry & Rule Engine

## Week 1 Deliverables

### Backend (`server/`)
- **MongoDB Time-Series setup**: ensures a time-series collection (`telemetry`) with `timeField: timestamp`, `metaField: metadata`, and indexes for device/metric queries (`server/src/config/db.js`).
- **Telemetry model**: Mongoose schema aligned to time-series documents (`server/src/models/Telemetry.js`).
- **High-speed ingestion endpoints** (Express):
  - `POST /api/telemetry/ingest` — accepts single point or batch payload (up to `INGEST_BATCH_LIMIT`, default 1000), validates/normalizes, inserts with `insertMany(..., { ordered: false })`.
  - `GET /api/telemetry/recent?deviceId=&metric=&limit=` — fetch recent points.
  - `GET /api/telemetry/stats?deviceId=&metric=` — aggregate count/min/max/avg/latest.
  - `GET /api/health` — service health check.
- **Ingestion audit (verified):** `npm run audit:ingestion` inserts 5,000 documents across 5 batches into MongoDB Time-Series `nexusflow.telemetry` and fails if throughput is below 5,000 writes/sec. The checked-in run (`server/artifacts/ingestion-audit.json`) recorded 5,000 writes in 665 ms (~7,519 writes/sec), 5 time-series buckets, and no extra storage/index allocation.

### Frontend (`client/`)
- **React + Vite app** scaffolded in `client/`.
- **React Flow canvas** with drag-and-drop nodes, connectable edges, minimap/controls/background.
- **Custom node library**: Data Sources, Math Operations, Action Triggers.
- **Graph serialization**: export current nodes/edges to JSON from the canvas sidebar using the tested pure helper
  `client/src/utils/graphSerialization.js` (includes a branching fan-out/fan-in fixture and JSON round-trip test).

> The earlier root-level `nexusflow-signup` scaffold has been removed. The NexusFlow app lives in `client/` and the backend in `server/`; run all commands from those directories.

## Week 2 Deliverables

### Backend (`server/`)
- **RxJS Stream Compiler** (`server/src/compiler/graphCompiler.js`): parses/validates React Flow JSON graphs, compiles to executable RxJS pipelines, supports runtime creation, and graph simulation.
  - **Node categories:** Data Sources (device/metric filtering), Math Operations (`movingAverage`, `threshold/comparison`, `scale`, `delta`, `passthrough`), Action Triggers (`sms`, `webhook`, `email`, `log`).
  - **Graph API** (`/api/graphs`): `POST /validate`, `POST /compile` (optionally activate), `POST /simulate`, `GET /active`, `POST /deactivate`.
  - **Graph persistence** (`/api/graphs/saved`): CRUD to save/load/update/delete graphs in MongoDB (`server/src/models/SavedGraph.js`, `server/src/controllers/savedGraphController.js`).
- **Dependencies added:** `rxjs`.

### Frontend (`client/`)
- **Expanded Node Library**: `client/src/nodes/DataSourceNode.jsx`, `MathOperationNode.jsx`, `ActionTriggerNode.jsx` with categorized palette (Data Sources, Math Operations, Action Triggers).
- **Configurable canvas** (`client/src/pages/CanvasPage.jsx`): node selection/editing panel, add nodes from library, Validate/Compile (RxJS)/Simulate actions calling backend compiler APIs, Serialize Graph export. Uses Vite `/api` proxy for dev.
- **Styles updated** for palette, config panel, and node states.

## Mid-Project Review Status

All Week 1 and Week 2 deliverables were completed and demonstrated before the mid-project review. The MongoDB time-series telemetry collection, high-speed Express ingestion endpoints, and the React Flow drag-and-drop canvas were implemented first; the RxJS graph compiler, the three custom node categories, and reliable graph serialization followed. Both the ingestion audit and the graph serialization check were verified during the mid-review demonstration, and every related change is committed to the repository.

> Note: Week 3 (live rule execution, WebSockets, and alerting) documented below was added after the mid-project review.

## Week 3 Deliverables — Live Rule Execution & WebSockets

### Backend (`server/`)
- **Live rule runtime** (`server/src/services/ruleEngine.js`): owns every active compiled RxJS pipeline (see [Multi-Rule Execution](#multi-rule-execution-beyond-the-weekly-plan)). `POST /api/telemetry/ingest` feeds every accepted point into every active runtime after the time-series write, so rules execute against real telemetry instead of only `/simulate`.
- **WebSocket hub** (`server/src/ws/telemetryHub.js`): native `ws` server at `ws://localhost:5000/ws`, with heartbeat/ping, welcome status, reconnect-safe broadcasting, and telemetry/alerts/rule-status messages.
- **Alert persistence** (`server/src/models/Alert.js`): every triggered Action Trigger is saved to the `alerts` MongoDB collection and broadcast to connected clients. `GET /api/alerts?limit=&nodeId=&kind=&since=` returns alert history.
- **Wiring** (`server/src/index.js`): Express and WebSocket share one HTTP server; the event bus connects ingestion, the rule engine, alert persistence, and the WS hub.
- **Mock simulator** (`server/scripts/telemetry-simulator.mjs`): continuously posts batches to the ingestion API (`npm run simulate`).
- **Tests**: `npm test` runs compiler/serialization (including a complex fan-out/fan-in graph), auth, multi-rule,
  ownership, rate-limit, and WebSocket welcome-scoping tests with `node --test` (17 tests). `npm run smoke:realtime`
  verifies registration → authenticated WS → two concurrent rules → fan-out → saved-graph activation → per-rule
  stop → owner isolation → stop-all → cleanup.

### Frontend (`client/`)
- **Live WebSocket client** (`client/src/hooks/useRealtime.js`): auto-reconnect, alert buffer, live telemetry buffer, and rule status.
- **Activate / Deactivate / Push Test Telemetry**: the canvas can now start and stop the live rule and inject matching telemetry without leaving the UI.
- **Live Alerts panel + Live Data tab**: alerts arrive instantly in the canvas and in the sidebar; the sidebar also shows recent telemetry points.
- **Saved graph browser**: save, load, refresh, and delete graphs directly from the canvas palette.
- **Config fix**: `client/.env` now uses the Vite `/api` and `/ws` proxy instead of the incorrect hard-coded port `5001`.

### Live demo (5 minutes)
1. Start MongoDB, then `cd server && npm run dev`.
2. Start the canvas: `cd client && npm run dev`.
3. Open `http://localhost:5173`, keep the default Turbine → Moving Average → Threshold → SMS graph.
4. Click **Activate Live**, then **Push Test Telemetry**. Alerts appear in the canvas overlay and the **Alerts** tab.
5. Optional: `cd server && npm run simulate` to stream continuous mock hardware telemetry.

## Security & Multi-Rule Execution (beyond the weekly plan)

These two features are not part of any weekly, mid-review, or final-review deliverable in `PROJECT.pdf`
(auth only appears in the narrative use case “the manager logs into NexusFlow”). They are implemented
on request and do not change the graded Week 1–3 behaviour: ingestion stays open to devices, and a single
activated rule behaves exactly as before.

### Authentication & ownership

- **Accounts** (`server/src/models/User.js`): name + unique lowercase email + `passwordHash`.
- **Password hashing** (`server/src/services/authService.js`): Node's built-in `crypto.scrypt` with a random
  16-byte salt and `timingSafeEqual` verification. Format: `scrypt$<salt>$<derivedKey>`. No native build step.
- **Sessions**: signed JWTs (`jsonwebtoken`, HS256) sent as `Authorization: Bearer <token>`. Send
  `POST /api/auth/register` or `POST /api/auth/login` to receive `{ token, user }`; `GET /api/auth/me`
  validates a stored session.
- **Protected resources**: saved-graph CRUD, graph activation/deactivation, and alert history require a valid
  token (`server/src/middleware/auth.js`). Saved graphs store `owner`/`ownerEmail`; another user's graph
  returns `404` so its existence is not leaked. Alert history is scoped to `ownerId`.
- **Public by design**: `POST /api/telemetry/ingest`, `/validate`, `/simulate`, and non-activating `/compile`
  (device ingest plus read-only compilation). `GET /api/graphs/active` now requires a session and returns only
  the caller's rules, so owners cannot inspect each other's runtimes or emails.
- **Rule ownership**: deactivation is scoped to the caller — `{ "all": true }` stops only that user's rules, and
  stopping another user's `runtimeId` returns `404`. Activating with a `graphId` requires ownership of that saved
  graph, so a rule cannot be replaced by passing someone else's id.
- **Abuse limits**: login (`20`/15 min) and registration (`10`/15 min) are rate-limited per IP; simulation is capped
  at 500 events per request; the server refuses to start with `NODE_ENV=production` unless `JWT_SECRET` is set.
- **WebSocket auth**: connect with `ws://localhost:5000/ws?token=<jwt>`; an invalid or missing token is
  closed with code `4001`. Alert frames are delivered only to the rule owner's sockets; telemetry and
  rule-status frames are shared.
- **Client** (`client/src/hooks/useAuth.jsx`, `client/src/pages/LoginPage.jsx`): context + `localStorage`
  session, sign-in/create-account tabs, and `authFetch` which attaches the bearer token. `App.jsx` gates the
  canvas behind login and exposes a user chip plus Sign out.

### Multi-rule execution

- **Runtime registry** (`server/src/services/ruleEngine.js`): a `Map` of independent RxJS runtimes. Keys are
  `graph:<savedGraphId>` for saved graphs and `adhoc:<uuid>` for canvas activations; re-activating the same
  saved graph replaces its runtime instead of duplicating it.
- **Fan-out**: each ingested batch is pushed to every active runtime, and the ingest response reports
  `evaluated`, `pointsEvaluated`, `activeRules`, and `ruleActive`.
- **Per-rule metadata**: every alert records `runtimeId`, `graphId`, `ruleName`, `ownerId`, and `ownerEmail`,
  so the UI can attribute live alerts to the rule that fired.
- **Control API**: `POST /api/graphs/deactivate` with `{ "runtimeId": "..." }` stops one rule and
  `{ "all": true }` (or an empty body) stops everything. Saved graphs have dedicated
  `POST /api/graphs/saved/:id/activate` and `/deactivate` endpoints.
- **UI** (`client/src/pages/CanvasPage.jsx`): header shows the active-rule count, the toolbar has
  **Activate / Update** and **Stop All**, ▶ activates a saved graph alongside others, and the
  **Active Rules** sidebar lists each runtime with its own stop button.

## Project Structure

```text
.
├── client/                  # React + React Flow canvas app
│   ├── src/
│   │   ├── hooks/           # useAuth (JWT session), useRealtime (WS client)
│   │   ├── nodes/           # DataSourceNode, MathOperationNode, ActionTriggerNode
│   │   ├── pages/           # CanvasPage, LoginPage
│   │   ├── utils/           # realtime + formatting helpers (tested)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js       # /api and /ws proxy
│   └── package.json
├── server/                  # Express + MongoDB Time-Series + WebSocket API
│   ├── scripts/             # ingestion audit, mock simulator, realtime smoke test
│   ├── src/
│   │   ├── compiler/        # graphCompiler.js (RxJS) + tests
│   │   ├── config/          # env, Mongo connection + time-series setup
│   │   ├── controllers/     # telemetry, graph, savedGraph, alert, auth controllers
│   │   ├── middleware/      # auth.js (requireAuth, optionalAuth), rateLimit.js
│   │   ├── models/          # Telemetry, SavedGraph, Alert, User schemas/models
│   │   ├── routes/          # telemetry, graphs, alerts, auth routes
│   │   ├── services/        # ruleEngine, alertService, authService, eventBus
│   │   ├── ws/              # telemetryHub (ws)
│   │   └── index.js
│   └── package.json
└── readme.md
```

## Prerequisites

- Node.js 18+
- MongoDB 5.0+ (required for native time-series collections)

## Backend Setup

```bash
cd server
npm install
copy .env.example .env   # Windows (PowerShell: Copy-Item .env.example .env)
npm run dev
```

Default server: `http://localhost:5000`

### Environment (`server/.env`)

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/nexusflow
MONGODB_DB=nexusflow
TELEMETRY_COLLECTION=telemetry
INGEST_BATCH_LIMIT=1000
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_IN=7d
```

> `JWT_SECRET` must be set to a long random value in any shared environment. If it is missing the server
> falls back to a development secret and logs a warning.

## Frontend (Canvas) Setup

```bash
cd client
npm install
copy .env.example .env   # optional; leave blank to use Vite /api proxy
npm run dev
```

Default client: `http://localhost:5173`

The Vite dev server proxies both `/api` and `/ws` to `http://localhost:5000`. Leave `VITE_API_BASE_URL` blank in `client/.env`; set `VITE_WS_URL` only when the client and backend are deployed on different origins.

## API Examples

### Auth
```bash
# Create an account (returns { token, user })
curl -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Floor Manager\",\"email\":\"manager@factory.example\",\"password\":\"secret123\"}"

# Sign in
curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"manager@factory.example\",\"password\":\"secret123\"}"

# Validate the session
curl http://localhost:5000/api/auth/me -H "Authorization: Bearer <token>"
```

### Health check
```bash
curl http://localhost:5000/api/health
```

### Ingest telemetry (single/batch)
```bash
curl -X POST http://localhost:5000/api/telemetry/ingest -H "Content-Type: application/json" -d "{\"deviceId\":\"turbine-01\",\"metric\":\"temperature\",\"value\":82.4,\"unit\":\"C\"}"
```

### Graph compiler
```bash
# Validate
curl -X POST http://localhost:5000/api/graphs/validate -H "Content-Type: application/json" -d "{\"nodes\":[...],\"edges\":[...]}"

# Compile
curl -X POST http://localhost:5000/api/graphs/compile -H "Content-Type: application/json" -d "{\"graph\":{\"nodes\":[...],\"edges\":[...]} }"

# Compile and activate as a rule (auth required; returns a runtimeId)
curl -X POST http://localhost:5000/api/graphs/compile -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d "{\"graph\":{\"nodes\":[...],\"edges\":[...]},\"activate\":true,\"name\":\"Turbine overheat\"}"

# Simulate without touching live rules
curl -X POST http://localhost:5000/api/graphs/simulate -H "Content-Type: application/json" -d "{\"graph\":{\"nodes\":[...],\"edges\":[...]},\"events\":[{\"deviceId\":\"turbine-01\",\"metric\":\"temperature\",\"value\":85}]}"

# Active rule status / stop one rule / stop all (auth required, scoped to the caller)
curl http://localhost:5000/api/graphs/active -H "Authorization: Bearer <token>"
curl -X POST http://localhost:5000/api/graphs/deactivate -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d "{\"runtimeId\":\"graph:<savedId>\"}"
curl -X POST http://localhost:5000/api/graphs/deactivate -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d "{\"all\":true}"
```

### Saved graphs (auth required, scoped to the signed-in user)
```bash
curl -X POST http://localhost:5000/api/graphs/saved -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d "{\"name\":\"My Pipeline\",\"graph\":{\"nodes\":[...],\"edges\":[...]}}"
curl http://localhost:5000/api/graphs/saved -H "Authorization: Bearer <token>"
curl http://localhost:5000/api/graphs/saved/<id> -H "Authorization: Bearer <token>"
curl -X POST http://localhost:5000/api/graphs/saved/<id>/activate -H "Authorization: Bearer <token>"
curl -X POST http://localhost:5000/api/graphs/saved/<id>/deactivate -H "Authorization: Bearer <token>"
```

### Alerts (auth required, scoped to the signed-in user)
```bash
curl "http://localhost:5000/api/alerts?limit=20" -H "Authorization: Bearer <token>"
curl "http://localhost:5000/api/alerts?nodeId=action-1&kind=sms" -H "Authorization: Bearer <token>"
```

### WebSocket protocol
Connect to `ws://localhost:5000/ws?token=<jwt>`; connections without a valid token are closed with code
`4001`. Server messages:

```json
{ "type": "welcome", "payload": { "clientId": "…", "serverTime": "…", "user": { "id": "…" }, "rule": { "active": true, "count": 2 } } }
{ "type": "telemetry", "payload": { "points": [{ "deviceId": "turbine-01", "metric": "temperature", "value": 85 }], "accepted": 1, "evaluated": 2, "activeRules": 2 } }
{ "type": "alert", "payload": { "nodeId": "action-1", "runtimeId": "graph:<id>", "ruleName": "Turbine overheat", "kind": "sms", "message": "Turbine temperature above threshold", "payload": { "value": 85 } } }
{ "type": "rule.status", "payload": { "active": true, "count": 2, "rules": [{ "runtimeId": "graph:<id>", "name": "Turbine overheat" }] } }
```

Send `{"type":"ping"}` to receive `{"type":"pong"}`. The client reconnects automatically with backoff.
`welcome.rule` and `rule.status` frames are scoped to the connected user; `alert` frames only reach the owner's
sockets, while `telemetry` frames are shared.

## Verification Status

- **Week 1:** Complete. Time-series setup, ingestion API, React/Vite canvas with React Flow drag-and-drop, and
  tested graph serialization. `npm run audit:ingestion` inserts 5,000 documents into the native time-series
  collection and fails below 5,000 writes/sec. Evidence: `server/artifacts/ingestion-audit.json`
  (665 ms, ~7,519 writes/sec, 5 buckets, no additional storage/index allocation).
- **Week 2:** Complete. RxJS compiler, configurable node library, Validate/Compile/Simulate, saved-graph CRUD.
  Proof includes a complex branching graph with fan-out/fan-in, validated and executed by
  `server/src/compiler/graphCompiler.test.js`, plus client-side serialization tests in
  `client/src/utils/graphSerialization.test.js`.
- **Week 3:** Complete. Activated rules receive live ingestion, alerts are persisted and broadcast over WebSockets, and the UI has Activate/Deactivate, Push Test Telemetry, Live Alerts, Live Data, and saved-graph browsing.
- **Extras (not scheduled deliverables):** JWT auth with per-user graph/alert ownership and multi-rule concurrency
  (many RxJS runtimes fed by one ingestion stream). Rule status is owner-scoped in REST, the deactivate response,
  and the WebSocket welcome frame.
- **Automated tests:** `cd server && npm test` → 17/17 passing (compiler, complex graph execution, serialization,
  scrypt hashing, JWT signing/verification, multi-runtime fan-out, per-rule stop, stop-all, owner-scoped
  status/stop, auth rate limiting, WebSocket welcome scoping).
- **Client tests:** `cd client && npm test` → 12/12 passing (branching graph serialization + JSON round trip,
  WebSocket URL resolution, token handling, alert merging/deduplication, formatting helpers).
- **Client build:** `cd client && npm run build` passes (Vite 6).
- **End-to-end smoke test:** `cd server && npm run smoke:realtime` verifies registration → 401 protection →
  authenticated WebSocket → two concurrent rules → same-point fan-out → saved-graph activation → single-rule
  stop → owner isolation (foreign graph `404`, foreign deactivate `404`, empty history) → stop-all → delete →
  DB cleanup. Evidence: `server/artifacts/realtime-smoke.json` (`ok: true`).

## Next (Future Work)

- Replace the simulated SMS action with a real provider (Twilio/etc.) and add alert cooldowns.
- Add richer logic nodes (AND/OR, branch/switch, debounce, time windows) and historical charts.
- Add refresh tokens / role-based access and per-rule rate limits for shared deployments.