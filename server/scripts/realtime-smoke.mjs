import mongoose from 'mongoose';
import { WebSocket } from 'ws';

const API_URL = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
const WS_URL = process.env.WS_URL || `${API_URL.replace(/^http/, 'ws')}/ws`;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexusflow';

const stamp = Date.now();
const primaryEmail = `smoke-${stamp}@example.com`;
const secondaryEmail = `smoke-other-${stamp}@example.com`;
const password = 'smoke-test-password';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = {};
  if (body != null) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function waitForMessage(socket, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      socket.off('error', onError);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    socket.on('message', onMessage);
    socket.on('error', onError);
  });
}

function buildGraph({ id, deviceId, threshold, actionKind = 'log' }) {
  return {
    version: 2,
    nodes: [
      {
        id: `${id}-source`,
        type: 'dataSource',
        position: { x: 0, y: 0 },
        data: { label: `${id} sensor`, kind: 'sensor', deviceId, metric: 'temperature', unit: 'C' },
      },
      {
        id: `${id}-threshold`,
        type: 'mathOperation',
        position: { x: 220, y: 0 },
        data: { label: `${id} threshold`, kind: 'threshold', operator: '>', threshold, field: 'value' },
      },
      {
        id: `${id}-action`,
        type: 'actionTrigger',
        position: { x: 440, y: 0 },
        data: {
          label: `${id} alert`,
          kind: actionKind,
          channel: actionKind,
          target: '+10000000000',
          message: `${id} rule fired`,
        },
      },
    ],
    edges: [
      { id: `${id}-e1`, source: `${id}-source`, target: `${id}-threshold` },
      { id: `${id}-e2`, source: `${id}-threshold`, target: `${id}-action` },
    ],
  };
}

function point(deviceId, value) {
  return { deviceId, metric: 'temperature', value, unit: 'C', source: 'smoke-test' };
}

async function cleanup(extra = {}) {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const telemetry = await db.collection('telemetry').deleteMany({
      'metadata.deviceId': { $in: ['smoke-a', 'smoke-b'] },
    });
    const alerts = await db.collection('alerts').deleteMany({
      ownerId: { $in: extra.ownerIds || [] },
    });
    const users = await db.collection('users').deleteMany({
      email: { $in: [primaryEmail, secondaryEmail] },
    });
    const graphs = await db.collection('savedgraphs').deleteMany({
      ownerEmail: { $in: [primaryEmail, secondaryEmail] },
    });
    await mongoose.disconnect();
    return {
      telemetry: telemetry.deletedCount,
      alerts: alerts.deletedCount,
      users: users.deletedCount,
      graphs: graphs.deletedCount,
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  const summary = { ok: false };
  let socket = null;
  let primaryToken = null;
  let secondaryToken = null;

  try {
    // 1. Register two accounts and prove route protection.
    const registered = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'Smoke Manager', email: primaryEmail, password },
    });
    if (!registered.res.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(registered.json)}`);
    }
    primaryToken = registered.json.token;
    summary.account = registered.json.user;

    const unauthenticatedAlerts = await api('/api/alerts?limit=5');
    if (unauthenticatedAlerts.res.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated alerts, got ${unauthenticatedAlerts.res.status}`);
    }

    const me = await api('/api/auth/me', { token: primaryToken });
    if (!me.res.ok) throw new Error(`GET /api/auth/me failed: ${JSON.stringify(me.json)}`);
    summary.me = me.json.user;

    // 2. Authenticated WebSocket.
    socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(primaryToken)}`);
    const welcomePromise = waitForMessage(socket, (message) => message.type === 'welcome', 5000);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const welcome = await welcomePromise;
    if (!welcome.payload?.user?.email) throw new Error('WebSocket welcome missing authenticated user');

    const wsAlerts = [];
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'alert') wsAlerts.push(message.payload);
      } catch {
        // Ignore malformed frames.
      }
    });

    // 3. Activate two independent rules.
    const graphA = buildGraph({ id: 'smoke-a', deviceId: 'smoke-a', threshold: 80 });
    const graphB = buildGraph({ id: 'smoke-b', deviceId: 'smoke-b', threshold: 50, actionKind: 'sms' });

    const activatedA = await api('/api/graphs/compile', {
      method: 'POST',
      token: primaryToken,
      body: { graph: graphA, activate: true, name: 'Smoke Rule A' },
    });
    if (!activatedA.res.ok) throw new Error(`Activate A failed: ${JSON.stringify(activatedA.json)}`);

    const activatedB = await api('/api/graphs/compile', {
      method: 'POST',
      token: primaryToken,
      body: { graph: graphB, activate: true, name: 'Smoke Rule B' },
    });
    if (!activatedB.res.ok) throw new Error(`Activate B failed: ${JSON.stringify(activatedB.json)}`);

    const runtimeA = activatedA.json.runtimeId;
    const runtimeB = activatedB.json.runtimeId;
    if (activatedB.json.status?.count !== 2) {
      throw new Error(`Expected 2 active rules, got ${activatedB.json.status?.count}`);
    }
    summary.activated = { runtimeA, runtimeB, count: activatedB.json.status.count };

    // 4. Fan-out: each rule only sees its own device/metric.
    let alertA = waitForMessage(socket, (message) => message.type === 'alert' && message.payload.runtimeId === runtimeA);
    await api('/api/telemetry/ingest', { method: 'POST', token: primaryToken, body: point('smoke-a', 95) });
    const firstA = await alertA;
    if (firstA.payload.ruleName !== 'Smoke Rule A') throw new Error('Rule A alert missing rule name');

    const alertB = waitForMessage(socket, (message) => message.type === 'alert' && message.payload.runtimeId === runtimeB);
    await api('/api/telemetry/ingest', { method: 'POST', token: primaryToken, body: point('smoke-b', 60) });
    await alertB;

    await api('/api/telemetry/ingest', { method: 'POST', token: primaryToken, body: point('smoke-a', 20) });
    await wait(300);
    if (wsAlerts.some((alert) => alert.runtimeId === runtimeA && alert.payload?.value === 20)) {
      throw new Error('Rule A fired below its threshold');
    }

    // 5. Save a graph, activate it alongside the others, and prove per-rule
    //    stop only affects that runtime.
    const saved = await api('/api/graphs/saved', {
      method: 'POST',
      token: primaryToken,
      body: { name: 'Smoke Saved Graph', graph: graphA },
    });
    if (!saved.res.ok) throw new Error(`Save graph failed: ${JSON.stringify(saved.json)}`);
    const savedId = String(saved.json.item._id);

    const savedActivated = await api(`/api/graphs/saved/${savedId}/activate`, {
      method: 'POST',
      token: primaryToken,
    });
    if (!savedActivated.res.ok) throw new Error(`Activate saved graph failed: ${JSON.stringify(savedActivated.json)}`);
    if (savedActivated.json.status?.count !== 3) {
      throw new Error(`Expected 3 active rules, got ${savedActivated.json.status?.count}`);
    }
    const savedRuntime = `graph:${savedId}`;

    const bothAPromise = Promise.all([
      waitForMessage(socket, (message) => message.type === 'alert' && message.payload.runtimeId === runtimeA),
      waitForMessage(socket, (message) => message.type === 'alert' && message.payload.runtimeId === savedRuntime),
    ]);
    await api('/api/telemetry/ingest', { method: 'POST', token: primaryToken, body: point('smoke-a', 99) });
    await bothAPromise;
    summary.fanOut = { samePointTriggeredRules: 2 };

    const stopped = await api('/api/graphs/deactivate', {
      method: 'POST',
      token: primaryToken,
      body: { runtimeId: runtimeA },
    });
    if (!stopped.res.ok || stopped.json.deactivated !== 1) {
      throw new Error(`Expected one rule stopped: ${JSON.stringify(stopped.json)}`);
    }

    await api('/api/telemetry/ingest', { method: 'POST', token: primaryToken, body: point('smoke-a', 95) });
    const savedAlert = await waitForMessage(
      socket,
      (message) => message.type === 'alert' && message.payload.runtimeId === savedRuntime
    );
    if (!savedAlert) throw new Error('Saved rule stopped firing unexpectedly');

    // 6. Persisted alert history is authenticated and scoped to the owner.
    const history = await api('/api/alerts?limit=20', { token: primaryToken });
    if (!history.res.ok || history.json.count < 4) {
      throw new Error(`Alert history unexpected: ${JSON.stringify(history.json)}`);
    }

    const other = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'Other Manager', email: secondaryEmail, password },
    });
    if (!other.res.ok) throw new Error(`Second registration failed: ${JSON.stringify(other.json)}`);
    secondaryToken = other.json.token;

    const forbiddenGraph = await api(`/api/graphs/saved/${savedId}`, { token: secondaryToken });
    if (forbiddenGraph.res.status !== 404) {
      throw new Error(`Expected 404 for another user's graph, got ${forbiddenGraph.res.status}`);
    }
    const otherAlerts = await api('/api/alerts?limit=20', { token: secondaryToken });
    if (otherAlerts.json.count !== 0) {
      throw new Error(`Expected isolated alert history, got ${otherAlerts.json.count}`);
    }
    summary.isolation = { foreignGraphStatus: forbiddenGraph.res.status, foreignAlerts: otherAlerts.json.count };

    // 7. A second user cannot stop, hijack, or inspect the first user's rules.
    const foreignStop = await api('/api/graphs/deactivate', {
      method: 'POST',
      token: secondaryToken,
      body: { runtimeId: runtimeB },
    });
    if (foreignStop.res.status !== 404) {
      throw new Error(`Expected 404 stopping another user's rule, got ${foreignStop.res.status}`);
    }

    const foreignStopAll = await api('/api/graphs/deactivate', {
      method: 'POST',
      token: secondaryToken,
      body: { all: true },
    });
    if (foreignStopAll.json.deactivated !== 0) {
      throw new Error(`Second user stopped foreign rules: ${JSON.stringify(foreignStopAll.json)}`);
    }

    const foreignActive = await api('/api/graphs/active', { token: secondaryToken });
    if (foreignActive.json.count !== 0) {
      throw new Error(`Expected an empty rule list for the second user, got ${foreignActive.json.count}`);
    }

    const anonymousActive = await api('/api/graphs/active');
    if (anonymousActive.res.status !== 401) {
      throw new Error(`Expected 401 without a token, got ${anonymousActive.res.status}`);
    }

    const hijack = await api('/api/graphs/compile', {
      method: 'POST',
      token: secondaryToken,
      body: { graph: graphB, activate: true, graphId: savedId, name: 'Hijack' },
    });
    if (hijack.res.status !== 404) {
      throw new Error(`Expected 404 activating another user's graph, got ${hijack.res.status}`);
    }

    const primaryStillActive = await api('/api/graphs/active', { token: primaryToken });
    if (primaryStillActive.json.count !== 2) {
      throw new Error(`Expected the primary user's 2 rules to survive, got ${primaryStillActive.json.count}`);
    }
    summary.ownership = {
      foreignStop: foreignStop.res.status,
      foreignStopAllDeactivated: foreignStopAll.json.deactivated,
      foreignActiveCount: foreignActive.json.count,
      anonymousActive: anonymousActive.res.status,
      hijackStatus: hijack.res.status,
      primaryRulesIntact: primaryStillActive.json.count,
    };

    // 8. Tear down all rules and the saved graph.
    const stopAll = await api('/api/graphs/deactivate', {
      method: 'POST',
      token: primaryToken,
      body: { all: true },
    });
    if (!stopAll.res.ok || stopAll.json.active !== false) {
      throw new Error(`Stop-all failed: ${JSON.stringify(stopAll.json)}`);
    }

    const removed = await api(`/api/graphs/saved/${savedId}`, { method: 'DELETE', token: primaryToken });
    if (!removed.res.ok) throw new Error(`Delete saved graph failed: ${JSON.stringify(removed.json)}`);

    summary.alertCount = history.json.count;
    summary.wsAlerts = wsAlerts.length;
    summary.stopAll = stopAll.json;
    summary.ok = true;
  } finally {
    try { socket?.close(); } catch {}
    await wait(150);
    summary.cleanup = await cleanup({
      ownerIds: [summary.account?.id, summary.me?.id].filter(Boolean),
    });
    // The secondary account id is only needed through its email cleanup.
    if (secondaryToken) summary.secondaryAccountCreated = true;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
