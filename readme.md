# NexusFlow — Visual IoT Telemetry Engine, Stream Compiler & Operator Console

NexusFlow is a full-stack industrial IoT telemetry processing and visual rule orchestration platform. It pairs high-throughput **MongoDB Time-Series Ingestion Engines** (both native driver micro-batching and Mongoose time-series pipelines) with an **RxJS Stream Compiler**, real-time **WebSocket Hub**, a visual **React Flow Canvas**, and an industrial **Operator Access Console**.

---

## 🚀 System Architecture & Key Capabilities

NexusFlow provides two cohesive subsystems tailored for edge-to-cloud IoT workflows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NexusFlow Architecture                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│  Visual IoT Rule Engine &    │              │  Industrial Time-Series      │
│  Live WebSocket Canvas       │              │  Ingestion & Operator Console│
│  (client/ & server/src/)     │              │  (src/ & server/)            │
├──────────────────────────────┤              ├──────────────────────────────┤
│ • React Flow Visual Canvas   │              │ • High-Speed Bulk & Micro-   │
│ • RxJS Stream Compiler       │              │   Batch Ingestion (21k+ w/s) │
│ • WebSocket Hub & Alerts     │              │ • MongoDB Time-Series Buckets│
│ • Multi-Rule Fan-Out Runtime │              │ • Downsampling & Anomalies   │
│ • JWT Per-User Ownership     │              │ • Dual-Mode Operator Console │
└──────────────────────────────┘              └──────────────────────────────┘
```

---

## 🌟 Modules & Deliverables

### 1. Visual IoT Telemetry & Rule Engine (`client/` & `server/src/`)

- **Week 1 Deliverables:**
  - **MongoDB Time-Series Setup:** native time-series collection (`telemetry`) with `timeField: timestamp`, `metaField: metadata`, and compound indexes (`server/src/config/db.js`).
  - **Mongoose Telemetry Model:** schema aligned to time-series documents (`server/src/models/Telemetry.js`).
  - **High-Speed Ingestion Endpoints:** `POST /api/telemetry/ingest`, `GET /recent`, `GET /stats`, `GET /health`.
  - **Ingestion Audit (`npm run audit:ingestion`):** inserts 5,000 documents across 5 batches in ~0.7 seconds (~7,042 writes/sec) into `nexusflow.telemetry`.
  - **React Flow Canvas (`client/`):** drag-and-drop node canvas, connectable edges, minimap, controls, and JSON serialization. Features HTML5 native drag-and-drop from the Node Library palette directly onto the canvas with real-time coordinate projection (`screenToFlowPosition` / `project`), visual drag handles, quick click-to-add buttons, semantic MiniMap node coloring, template presets, and guest demo access.

- **Week 2 Deliverables — Logic Compiler Engine:**
  - **RxJS Stream Compiler (`server/src/compiler/graphCompiler.js` & `server/src/compiler/index.js`):** Node.js engine that parses saved React Flow JSON graphs (raw objects, serialized JSON, or wrapped MongoDB `SavedGraph` schemas) and converts them into executable RxJS data streams with cycle-safe DAG execution, multi-node fan-in/fan-out, and live simulation.
  - **Graph Parsing & Normalization (`parseReactFlow`, `normalizeGraph`):** robust deserialization handling React Flow viewports, node types, coordinate projections, and handles.
  - **Topological Validation (`validateGraph`):** Kahn's algorithm cycle detection, terminal action verification, missing reference checks, duplicate ID detection, and dead-end/isolated node diagnostics.
  - **Transform & Math Operation Suite:** `movingAverage` (sliding window), `threshold/comparison` (`>`, `>=`, `<`, `<=`, `==`, `!=`, `between`, `outside`), `scale` (factor & offset), `delta` (differential change), `rateOfChange` (units/second), `min`/`max` accumulators, and `passthrough`.
  - **Action Triggers & Message Templating:** `sms`, `webhook`, `email`, `log`, `alert` channels with template variable interpolation (`{deviceId}`, `{metric}`, `{value}`, `{threshold}`).
  - **RxJSRuntime Engine:** lifecycle-managed reactive pipeline providing `ingress$`, `actions$`, `traces$`, `errors$`, per-node stream taps (`getNodeStream`), direct node injection (`pushToNode`), batch execution, and clean `destroy()` teardown.
  - **Dynamic Compiler Registry (`LogicCompiler`):** dynamic registration of custom math operations and custom action channels at runtime.
  - **Compiler API (`/api/graphs`):** `/validate`, `/compile` (with activation flag), `/simulate`, `/active`, `/deactivate`.
  - **Graph Persistence (`/api/graphs/saved`):** CRUD operations for MongoDB graph storage.
  - **Canvas Node Library:** `DataSourceNode`, `MathOperationNode`, `ActionTriggerNode` with configuration panels.

- **Week 3 Deliverables — Live Rule Execution & WebSockets:**
  - **Live Rule Runtime (`server/src/services/ruleEngine.js`):** multi-rule fan-out executing incoming telemetry against all active RxJS pipelines.
  - **WebSocket Hub (`server/src/ws/telemetryHub.js`):** `ws://localhost:5000/ws` with heartbeat, welcome status, reconnect handling, and live alert/telemetry broadcasts.
  - **Alert Persistence & History (`server/src/models/Alert.js`):** saves fired actions to MongoDB; `GET /api/alerts`.
  - **Telemetry Mock Simulator (`server/scripts/telemetry-simulator.mjs`):** continuous ingestion streaming.
  - **Canvas Real-Time Integration:** `useRealtime` hook, live alert drawer, telemetry buffer, and runtime rule toggle.

- **Security, Multi-Provider Authentication & Full Responsiveness:**
  - **Multi-Provider Authentication:** Sign in with Google (OAuth & profile simulation), Facebook, Email & password (`scrypt` salted hashing), 1-click Demo Operator login, or instant Guest Canvas access.
  - **Offline & Downtime Resilience:** Resilient local storage fallback (`localStorage`) prevents "Request failed" lockouts whenever the backend or MongoDB is offline—allowing operators to always access and edit visual rule graphs immediately.
  - **Per-User Isolation:** Saved graphs and alert histories securely scoped to authenticated user IDs and linked provider sessions.
  - **Full Responsiveness across All Devices:**
    - Mobile-first adaptive layout supporting smartphones (320px–480px), tablets (481px–960px), and wide monitors.
    - Mobile Workspace View Switcher (`mobile-view-nav`) toggling seamlessly between **Node Library**, **Rule Canvas**, and **Output & Alerts**.
    - Touch-optimized node addition (+ tap buttons alongside drag-and-drop), touch controls, and smart minimap suppression on mobile screens.
  - **Concurrent Runtimes:** Independent active pipeline map allowing multiple rules to evaluate identical telemetry streams concurrently.

---

### 2. Industrial Time-Series Ingestion Engine & Operator Console (`server/` & `src/`)

- **High-Throughput Ingestion Architecture:**
  - **Native MongoDB Time-Series Setup (`server/config/db.js`, `server/models/telemetryCollection.js`):** automated provisioning of `hardware_telemetry` collection with columnar bucket compression and secondary compound indexes (`idx_device_timestamp`, `idx_facility_timestamp`, `idx_devicetype_timestamp`, `idx_status_timestamp`).
  - **Synchronous Single-Point Ingestion (`POST /api/telemetry/single`):** sub-millisecond point ingest with zero-overhead schema validation.
  - **Unordered Bulk Ingestion (`POST /api/telemetry/batch`):** parallel `insertMany({ ordered: false })` achieving **21,700+ writes/second** for up to 10,000 points per payload.
  - **In-Memory Micro-Batch Buffer (`POST /api/telemetry/buffer`):** non-blocking queue (`202 Accepted`) with configurable flush triggers (1,000 items or 100ms interval) and graceful shutdown drain.
- **Real-Time Downsampling & Analytics:**
  - **Time-Series Aggregation (`GET /api/telemetry/aggregate`):** `$dateTrunc` pipeline calculating `min`, `max`, `avg`, and alert counters across arbitrary granularities (second, minute, hour, day).
  - **Point Lookup & Anomaly Detection:** `GET /api/telemetry/latest/:deviceId`, `GET /api/telemetry/anomalies`, and storage breakdown via `GET /api/telemetry/stats`.
- **Operator Access Console (`src/`):**
  - **Dual-Mode Access (`#login` / `#signup`):** deep-linked console with email state preservation and animated stream preview.
  - **Client-Side Cryptographic Security:** per-account salted SHA-256 password hashing with fallback, social login simulation, and robust form validation.

---

## 📁 Repository Structure

```text
project_1/
├── index.html                               # Root Operator Console HTML shell
├── package.json                             # Root configuration, scripts & dependencies
├── vite.config.js                           # Root Vite build configuration
├── readme.md                                # Unified project documentation
├── AGENTS.md                                # Mandatory agent rules & guidelines
├── GEMINI.md                                # Workspace guidelines
├── .env / .env.example                      # Root environment configuration
│
├── frontend/                                # Visual Canvas Application (Port 5173 - React Flow + Vite)
│   ├── index.html
│   ├── vite.config.js                       # Proxying /api and /ws to backend port 5000
│   ├── package.json
│   └── src/
│       ├── App.jsx                          # Canvas entry component
│       ├── main.jsx
│       ├── hooks/                           # useAuth (JWT), useRealtime (WS client)
│       ├── nodes/                           # DataSourceNode, MathOperationNode, ActionTriggerNode
│       ├── pages/                           # CanvasPage, LoginPage
│       ├── styles/                          # Canvas styling, draggable items & theme tokens
│       └── utils/                           # format.js, canvas.js, canvas.test.js, format.test.js, realtime.js
│
├── backend/                                 # Telemetry & Rule Engine Services (Port 5000 - Express + RxJS + WS)
│   ├── package.json                         # Backend dependencies & dev/start scripts
│   ├── index.js                             # Direct MongoDB Driver entry
│   ├── app.js                               # Root Express application config
│   ├── config/                              # Database connection pools
│   ├── controllers/                         # Root telemetry controllers
│   ├── middleware/                          # Validation middleware
│   ├── models/                              # Time-Series collection definitions
│   ├── routes/                              # Root telemetry routes
│   ├── services/                            # Ingestion & Micro-batch buffer
│   ├── scripts/                             # Ingestion benchmarks & simulator
│   ├── tests/                               # Server unit & integration tests
│   └── src/                                 # Rule Engine & Compiler Backend (Mongoose + RxJS + WS Hub)
│       ├── index.js                         # Unified HTTP + WebSocket server
│       ├── compiler/                        # RxJS graph compiler & tests
│       ├── config/                          # Environment & Mongoose connection
│       ├── controllers/                     # Alert, Auth, Graph, SavedGraph, Telemetry
│       ├── middleware/                      # Auth middleware
│       ├── models/                          # Mongoose models: Alert, SavedGraph, Telemetry, User
│       ├── routes/                          # Express route definitions
│       ├── services/                        # ruleEngine, alertService, authService, eventBus
│       └── ws/                              # Native WebSocket telemetry hub
│
├── client/                                  # Canvas application source alias
├── server/                                  # Telemetry & server source alias
│
└── src/                                     # Operator Access Console (Frontend)
    ├── App.jsx                              # Operator console root component
    ├── main.jsx
    ├── components/                          # Forms, PipelinePreview, BrandLogo, SocialAuthModal
    ├── pages/                               # AuthPage, LoginPage, SignUpPage
    ├── styles/                              # Industrial dark UI styling
    └── utils/                               # Client auth engine, salted hashing & validation tests
```

---

## 🚦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [MongoDB](https://www.mongodb.com/) (v5.0+ required for native Time-Series collections; local instance on `mongodb://127.0.0.1:27017/`)

---

### Option A: Running the Visual Rule Engine & Canvas

#### 1. Start the Backend Server (Port 5000)

```bash
cd backend
npm run dev
```

*Backend server listens on `http://localhost:5000` with WebSocket telemetry hub at `ws://localhost:5000/ws`.*

#### 2. Start the Frontend Visual Canvas (Port 5173)

```bash
cd frontend
npm run dev
```

*Frontend starts Vite dev server at `http://localhost:5173`, automatically proxying `/api` and `/ws` to the backend on port 5000.*

#### 3. Test the Rule Pipeline

1. Open `http://localhost:5173` in your browser.
2. Click **"Open Visual Canvas in Guest Mode →"** or log in.
3. In the Canvas, click **Activate Live** on the default pipeline.
4. Click **Push Test Telemetry** to trigger alerts in real time.
5. (Optional) Run the continuous telemetry simulator:
   ```bash
   cd backend
   npm run simulate
   ```

---

### Option B: Running the Ingestion Engine & Operator Console

#### 1. Install Root Dependencies

```bash
cd project_1
npm install
```

#### 2. Configure Environment

Create or update `.env` in the project root:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/
MONGODB_DB_NAME=nexus
TELEMETRY_COLLECTION_NAME=hardware_telemetry
BUFFER_MAX_BATCH_SIZE=1000
BUFFER_FLUSH_INTERVAL_MS=100
```

#### 3. Initialize Time-Series Collection

```bash
npm run server:init
```

#### 4. Launch Ingestion Engine & Run Benchmark

```bash
# Start server
npm run server

# In another terminal: execute 5,000-point ingestion benchmark
npm run server:benchmark
```

#### 5. Launch Operator Console

```bash
npm run dev
```

*Open `http://localhost:5173` to view the Operator Access Console.*

---

## 📡 API Reference

### Telemetry Ingestion & Analytics

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/telemetry/single` | Synchronous single point ingestion (Native driver) |
| `POST` | `/api/telemetry/batch` | High-speed unordered bulk ingestion up to 10k points |
| `POST` | `/api/telemetry/buffer` | In-memory queue with asynchronous micro-batch flush |
| `POST` | `/api/telemetry/ingest` | Rule Engine ingestion endpoint (triggers active RxJS pipelines) |
| `GET` | `/api/telemetry/latest/:deviceId` | Retrieve latest indexed sensor packet |
| `GET` | `/api/telemetry/recent` | Recent telemetry records with device/metric filter |
| `GET` | `/api/telemetry/aggregate` | Downsampling aggregation (`$dateTrunc` by minute/hour/day) |
| `GET` | `/api/telemetry/anomalies` | Query out-of-tolerance readings (temp, vibration, critical) |
| `GET` | `/api/telemetry/stats` | Ingestion & physical storage bucket metrics |
| `GET` | `/api/health` | Health check probe |

### Graph Compiler & Live Rule Orchestration

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/graphs/validate` | Validate React Flow node/edge structure |
| `POST` | `/api/graphs/compile` | Compile graph to RxJS stream (supports `activate: true`) |
| `POST` | `/api/graphs/simulate` | Test events against graph without activating rules |
| `GET` | `/api/graphs/active` | List running rule runtime IDs and metadata |
| `POST` | `/api/graphs/deactivate` | Stop a specific runtime (`runtimeId`) or stop all (`all: true`) |
| `GET/POST` | `/api/graphs/saved` | CRUD endpoints for persisting graphs in MongoDB |
| `POST` | `/api/graphs/saved/:id/activate` | Activate a saved pipeline by ID |
| `POST` | `/api/graphs/saved/:id/deactivate` | Deactivate an active saved pipeline |

### Authentication & WebSockets

| Protocol | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register operator account with `scrypt` hashing (returns JWT) |
| `POST` | `/api/auth/login` | Authenticate credentials and receive JWT |
| `POST` | `/api/auth/social` | Authenticate or provision via Google or Facebook OAuth session |
| `GET` | `/api/auth/me` | Verify JWT session and fetch profile |
| `GET` | `/api/alerts` | Query persisted rule trigger alerts (scoped to user) |
| `WS` | `/ws?token=<jwt>` | Authenticated WebSocket stream (`welcome`, `telemetry`, `alert`, `rule.status`) |

---

## 🧪 Automated Testing

The repository features comprehensive automated test suites across all layers:

```bash
# 1. Operator Console Client Tests (16 unit & validation tests)
npm test

# 2. Visual Canvas Drag-and-Drop & Utilities (8 unit tests)
npm run test:frontend

# 3. Logic Compiler & RxJS Engine Tests (22 unit & simulation tests)
npm run test:compiler

# 4. Ingestion Engine & Time-Series Tests
npm run test:backend

# 5. Run Unified Test Suite across all layers (46 tests)
npm run test:all

# 6. Compiler, Auth & Multi-Rule Tests (Server / Backend suite)
node --test server/src/compiler/graphCompiler.test.js server/src/services/ruleEngine.test.js
```

---

## 🔄 Automatic Documentation Maintenance

As mandated in `AGENTS.md` and `GEMINI.md`, this `readme.md` is automatically maintained and kept in continuous synchronization with all database schemas, API routes, client components, and project dependencies.
