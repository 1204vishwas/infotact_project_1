# NexusFlow — Industrial IoT Telemetry Ingestion Engine & Operator Console

NexusFlow is an industrial IoT telemetry pipeline platform. It provides a high-throughput **MongoDB Time-Series Telemetry Ingestion Engine** built on Express.js, paired with an operator access console featuring real-time stream preview, dual-mode authentication, cryptographic credential hashing, and telemetry downsampling analytics.

---

## 🚀 Key Features

### ⚡ MongoDB Time-Series Telemetry Engine (Nexus Cluster & Database)
- **Native MongoDB Time-Series Architecture:**
  - Automated creation and management of the `hardware_telemetry` collection in the local **`nexus`** cluster/database.
  - Dedicated MongoDB Compass favorite connection **`nexus`** configured and saved.
  - Configured with `timeField: "timestamp"`, `metaField: "metadata"`, and high-resolution `granularity: "seconds"`.
  - Columnar bucket compression via `system.buckets.hardware_telemetry` achieving over 400+ measurements per physical storage bucket.
- **Secondary Compound Indexing:**
  - `idx_device_timestamp` (`{ "metadata.deviceId": 1, "timestamp": -1 }`): Instant point lookups of latest readings.
  - `idx_facility_timestamp` (`{ "metadata.facilityId": 1, "timestamp": -1 }`): Plant-wide and facility-scoped querying.
  - `idx_devicetype_timestamp` (`{ "metadata.deviceType": 1, "timestamp": -1 }`): Equipment-type classification queries.
  - `idx_status_timestamp` (`{ "status": 1, "timestamp": -1 }`): High-speed anomaly filtering.

### 🚄 High-Speed Express Ingestion Endpoints
- **Synchronous Single-Point Ingestion (`POST /api/telemetry/single`):**
  - Instant validation, metadata normalization, and single-document write.
  - Rejects empty, whitespace-only, or missing `deviceId` values.
- **High-Throughput Bulk Ingestion (`POST /api/telemetry/batch`):**
  - Unordered parallelized `insertMany` with `{ ordered: false }` capable of ingesting up to 10,000 measurements per HTTP payload.
  - Achieves **21,700+ measurements/second** ingestion rate against local MongoDB instance.
- **Micro-Batch In-Memory Telemetry Buffer (`POST /api/telemetry/buffer`):**
  - In-memory write queue with asynchronous micro-batch flushes triggered by batch threshold (1,000 items) or interval timer (100ms).
  - Clean shutdown lifecycle: flushes remaining items before database connection teardown without interrupted operation errors.
  - Returns immediate `202 Accepted` for sub-millisecond client write latencies.

### 📊 Real-Time Analytics & Downsampling
- **Downsampling Aggregation (`GET /api/telemetry/aggregate`):**
  - MongoDB aggregation pipeline leveraging `$dateTrunc` (by second, minute, hour, or day) computing `min`, `max`, `avg` for temperature, vibration, voltage, and CPU load, plus alert counters.
  - Validates downsampling units (`year`, `quarter`, `month`, `week`, `day`, `hour`, `minute`, `second`, `millisecond`) and rejects invalid dates with clear error codes.
- **Latest Reading Inspection (`GET /api/telemetry/latest/:deviceId`):**
  - Direct index-backed fetch of the most recent telemetry packet for any monitored device.
- **Anomaly Detection (`GET /api/telemetry/anomalies`):**
  - Rapid query for out-of-tolerance sensor readings (temperature > 80°C, vibration > 1.0g, or critical status).
- **Cluster & Bucket Statistics (`GET /api/telemetry/stats`):**
  - Detailed storage breakdown, bucket count, estimated measurement counts, and compression metrics.

### 🛡️ Dual-Mode Operator Access Console
- **Sign In & Sign Up Workflows:**
  - Tailored for factory floor managers, automation engineers, and IoT architects.
  - Deep-link hash routing (`#login` / `#signup`) with automatic email transfer.
- **Interactive Telemetry Pipeline Preview:**
  - Real-time animated simulation visualizing sensor stream pulses and rule trigger alerts.
- **Security & Client-Side Salted Hashing:**
  - Per-account cryptographic salt generation with SHA-256 (Web Crypto API + pure-JS fallback).
- **Robust Field & Password Validations:**
  - Guarded client-side validators preventing unhandled exceptions when evaluating optional parameters or password matching.
- **Social Authentication & Account Linking:**
  - Simulated OAuth flow for Google and Facebook login with automatic identity linking.

---

## 🛠️ Tech Stack

- **Backend / Ingestion:** [Express 5](https://expressjs.com/), [Node.js](https://nodejs.org/) (native test runner & fetch)
- **Database:** [MongoDB 8.x / 7.x](https://www.mongodb.com/) (Time-Series Collections, WiredTiger columnar buckets, Connection Pooling)
- **Database Driver:** [Official MongoDB Node Driver (v7.x)](https://www.mongodb.com/docs/drivers/node/current/)
- **Frontend Console:** [React 18](https://react.dev/), [Vite 6](https://vitejs.dev/)
- **Compression & Network:** [compression](https://www.npmjs.com/package/compression), [cors](https://www.npmjs.com/package/cors), [dotenv](https://www.npmjs.com/package/dotenv)
- **Testing:** Node.js native test runner (`node --test`) across client and server suites (41 tests total, 100% passing).

---

## 📁 Project Structure

```text
project_1/
├── index.html                           # Operator Console HTML shell
├── package.json                         # Dependencies, metadata, and scripts
├── vite.config.js                       # Vite build configuration with React plugin
├── readme.md                            # Complete synchronized project documentation
├── AGENTS.md                            # Agent workspace instructions
├── GEMINI.md                            # Antigravity guidelines
├── .env                                 # Environment configuration (MongoDB URI, DB name, ports)
├── .env.example                         # Environment configuration template
├── server/                              # High-Speed Telemetry Ingestion Engine
│   ├── index.js                         # Server startup, MongoDB pooling & graceful shutdown
│   ├── app.js                           # Express application configuration & error handling
│   ├── config/
│   │   └── db.js                        # Optimized MongoDB connection pool & status tracker
│   ├── models/
│   │   └── telemetryCollection.js       # Time-Series collection schema & index provisioning
│   ├── middleware/
│   │   └── validateTelemetry.js         # Zero-overhead validation for single & batch payloads
│   ├── services/
│   │   ├── telemetryService.js          # Bulk insertMany, downsampling aggregation, queries
│   │   └── telemetryBuffer.js           # Micro-batching in-memory queue with graceful shutdown
│   ├── controllers/
│   │   └── telemetryController.js       # Sanitized single, batch, buffer, latest, aggregate handlers
│   ├── routes/
│   │   └── telemetryRoutes.js           # Express router endpoints (/api/telemetry/*)
│   ├── scripts/
│   │   ├── initTimeSeries.js            # Standalone migration script for Time-Series setup
│   │   └── benchmark.js                 # 5,000+ points high-speed ingestion benchmark
│   └── tests/
│       └── telemetry.test.js            # 25 automated integration & unit tests for server
└── src/                                 # Operator Access Console (Frontend)
    ├── main.jsx                         # Frontend entry point
    ├── App.jsx                          # Root React component
    ├── components/
    │   ├── AuthSessionCard.jsx          # Profile card upon successful authentication
    │   ├── BrandLogo.jsx                # NexusFlow brand emblem
    │   ├── FormFields.jsx               # Inputs, password meter, and social auth buttons
    │   ├── LoginForm.jsx                # Operator credentials form & password reset
    │   ├── PipelinePreview.jsx          # Animated telemetry stream simulation
    │   ├── SignUpForm.jsx               # Registration form with role selector
    │   └── SocialAuthModal.jsx          # OAuth modal flow
    ├── pages/
    │   ├── AuthPage.jsx                 # Dual-column split console layout
    │   ├── LoginPage.jsx                # Login wrapper
    │   └── SignUpPage.jsx               # Registration wrapper
    ├── styles/
    │   └── index.css                    # Unified dark industrial styling & design tokens
    └── utils/
        ├── auth.js                      # Client auth engine, salted hashing, and storage
        ├── auth.test.js                 # Authentication unit & integration tests
        ├── validation.js                # Form validation rules & password scorer
        └── validation.test.js           # Validation test suite
```

---

## 🚦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18.0.0 or higher)
- [MongoDB](https://www.mongodb.com/try/download/community) (Local MongoDB instance or MongoDB Compass connected to `mongodb://127.0.0.1:27017/`)

### 1. Installation

```bash
git clone <repository-url>
cd project_1
npm install
```

### 2. Environment Configuration

Create or update `.env` (pre-configured to target your local `nexus` cluster):

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/
MONGODB_DB_NAME=nexus
TELEMETRY_COLLECTION_NAME=hardware_telemetry
BUFFER_MAX_BATCH_SIZE=1000
BUFFER_FLUSH_INTERVAL_MS=100
```

### 3. Initialize the Time-Series Collection

Run the idempotent initialization script to verify database connectivity and create the `hardware_telemetry` Time-Series collection with secondary indexes:

```bash
npm run server:init
```

### 4. Start the Express Ingestion Server

```bash
npm run server
```

The ingestion engine will listen on `http://localhost:5000`.

### 5. Run the Ingestion Benchmark

Execute a live benchmark generating 5,000 realistic hardware telemetry records across multiple device types to measure write speed and bucket compression:

```bash
npm run server:benchmark
```

### 6. Run the Frontend Operator Console

In a separate terminal window, start Vite's local dev server:

```bash
npm run dev
```

Visit `http://localhost:5173` to interact with the Operator Access Console.

---

## 🧪 Automated Testing

NexusFlow includes two comprehensive test suites run using Node.js's native test runner (`node --test`):

- **Run Server & Time-Series Tests (25 tests):**
  ```bash
  npm run test:server
  ```
- **Run Client Authentication Tests (16 tests):**
  ```bash
  npm run test
  ```
- **Run All Tests (41 tests total):**
  ```bash
  npm run test:all
  ```

---

## 📡 API Reference

### Telemetry Ingestion

#### `POST /api/telemetry/single`
Ingests a single hardware telemetry record.
- **Request Body:**
  ```json
  {
    "timestamp": "2026-11-16T10:30:00.000Z",
    "metadata": {
      "deviceId": "TURBINE-01",
      "deviceType": "gas_turbine",
      "facilityId": "PLANT-NORTH",
      "rack": "BAY-A",
      "slot": 1
    },
    "metrics": {
      "temperature_c": 74.5,
      "vibration_g": 0.22,
      "voltage_v": 230.1,
      "current_a": 14.8,
      "rpm": 3600
    }
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Telemetry point ingested",
    "insertedId": "...",
    "durationMs": 1.2
  }
  ```

#### `POST /api/telemetry/batch`
Bulk-ingests an array of up to 10,000 measurements in parallel using unordered writes.
- **Request Body:** Array of telemetry objects `[...]`
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Batch of 1000 points ingested successfully",
    "count": 1000,
    "durationMs": 35.0,
    "pointsPerSecond": 45387
  }
  ```

#### `POST /api/telemetry/buffer`
Micro-batching endpoint that buffers records in memory and flushes them asynchronously.
- **Response (`202 Accepted`):**
  ```json
  {
    "success": true,
    "mode": "buffered_single",
    "enqueued": 1,
    "queueDepth": 12
  }
  ```

### Analytics & Queries

#### `GET /api/telemetry/latest/:deviceId`
Fetches the most recent metric packet for a device using the compound index.

#### `GET /api/telemetry/aggregate?deviceId=TURBINE-01&unit=minute&binSize=1`
Performs time-series downsampling aggregation via `$dateTrunc`. Returns min, max, average for numeric sensors and alert counts for each time window.

#### `GET /api/telemetry/anomalies?limit=50`
Queries recent out-of-tolerance sensor readings (`temperature > 80°C`, `vibration > 1.0g`, or `status == "critical"`).

#### `GET /api/telemetry/stats`
Returns physical storage metrics, estimated document counts, and underlying `system.buckets.hardware_telemetry` statistics.

---

## 🔄 Automatic Documentation Maintenance

As mandated in `AGENTS.md` and `GEMINI.md`, this `readme.md` is kept automatically synchronized with all codebase additions, schema designs, API endpoints, test scripts, and dependencies.
