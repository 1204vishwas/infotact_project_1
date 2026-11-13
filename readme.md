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
- **Ingestion audit (verified):** `node server/scripts/ingestion-audit.mjs` inserted 5,000 documents across 5 batches in 777 ms (~6,435 writes/sec) into MongoDB Time-Series `nexusflow.telemetry` with minimal storage impact (time-series bucketing observed).

### Frontend (`client/`)
- **React + Vite app** scaffolded in `client/`.
- **React Flow canvas** with drag-and-drop nodes, connectable edges, minimap/controls/background.
- **Starter custom nodes**: Data Source, Filter, Action.
- **Graph serialization**: export current nodes/edges to JSON from the canvas sidebar.

> Note: the repository root also contains an earlier `nexusflow-signup` Vite scaffold (`src/`, root `package.json`). Week 1 NexusFlow app lives in `client/` and backend in `server/`.

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

## Project Structure

```text
.
├── client/                  # React + React Flow canvas app
│   ├── src/
│   │   ├── nodes/           # DataSourceNode, MathOperationNode, ActionTriggerNode (Week 2)
│   │   ├── pages/CanvasPage.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js       # /api proxy
│   └── package.json
├── server/                  # Express + MongoDB Time-Series API
│   ├── scripts/ingestion-audit.mjs
│   ├── src/
│   │   ├── compiler/        # graphCompiler.js (RxJS)
│   │   ├── config/          # env, Mongo connection + time-series setup
│   │   ├── controllers/     # telemetry, graph, savedGraph controllers
│   │   ├── models/          # Telemetry, SavedGraph schemas/models
│   │   ├── routes/          # telemetry, graphs routes
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
```

## Frontend (Canvas) Setup

```bash
cd client
npm install
copy .env.example .env   # optional; leave blank to use Vite /api proxy
npm run dev
```

Default client: `http://localhost:5173`

## API Examples

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

# Simulate
curl -X POST http://localhost:5000/api/graphs/simulate -H "Content-Type: application/json" -d "{\"graph\":{\"nodes\":[...],\"edges\":[...]},\"events\":[{\"deviceId\":\"turbine-01\",\"metric\":\"temperature\",\"value\":85}]}"
```

### Saved graphs
```bash
curl -X POST http://localhost:5000/api/graphs/saved -H "Content-Type: application/json" -d "{\"name\":\"My Pipeline\",\"graph\":{\"nodes\":[...],\"edges\":[...]}}"
curl http://localhost:5000/api/graphs/saved
```

## Week 1–2 Status

- **Week 1:** Complete (time-series setup, ingestion API, canvas scaffold/serialization). Ingestion audit passed: **5,000 writes in ~777 ms (~6,435 writes/sec)** into native MongoDB Time-Series collection.
- **Week 2:** Complete (RxJS stream compiler, expanded node library with configurable nodes, Validate/Compile/Simulate UI, graph persistence CRUD). Client builds successfully.

## Next (Week 3 Preview)

- Connect incoming WebSocket telemetry to dynamically compiled RxJS pipelines for in-memory rule evaluation.
- Build live dashboards (Recharts/Chart.js) subscribed to WebSocket streams.