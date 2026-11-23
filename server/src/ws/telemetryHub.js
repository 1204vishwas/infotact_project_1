import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Minimal WebSocket fan-out hub mounted on the same HTTP server as Express.
 * Clients authenticate with `?token=<jwt>` and receive telemetry batches,
 * their own persisted alerts, their own rule status, and live telemetry.
 */
export function createTelemetryHub(server, {
  path = '/ws',
  getStatus = () => null,
  verifyToken = null,
} = {}) {
  const wss = new WebSocketServer({
    server,
    path,
    perMessageDeflate: false,
    maxPayload: 64 * 1024,
    clientTracking: false,
  });

  const clients = new Map();
  let closed = false;

  const send = (socket, message) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // The close handler will remove broken sockets.
    }
  };

  /**
   * `ownerId` scopes a message to the connected user who owns the rule that
   * produced it. Messages without an owner (telemetry, rule status) fan out
   * to every authenticated client.
   */
  const broadcast = (type, payload, { ownerId = null } = {}) => {
    if (clients.size === 0) return 0;
    const frame = JSON.stringify({ type, payload, sentAt: new Date().toISOString() });
    const scope = ownerId != null ? String(ownerId) : null;
    let delivered = 0;

    for (const [socket, meta] of clients.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (scope && meta.userId && meta.userId !== scope) continue;
      try {
        socket.send(frame);
        delivered += 1;
      } catch {
        // Ignore individual socket failures; heartbeat will clean them up.
      }
    }
    return delivered;
  };

  wss.on('connection', (socket, request) => {
    let user = null;

    if (verifyToken) {
      let token = null;
      try {
        const url = new URL(request?.url || '', 'http://localhost');
        token = url.searchParams.get('token');
      } catch {
        token = null;
      }
      user = token ? verifyToken(token) : null;
      if (!user) {
        try { socket.close(4001, 'Authentication required'); } catch {}
        return;
      }
    }

    const clientId = randomUUID();
    clients.set(socket, { clientId, userId: user?.id || null, alive: true });

    socket.on('pong', () => {
      const meta = clients.get(socket);
      if (meta) meta.alive = true;
    });

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: 'error', payload: { error: 'Invalid JSON message' } });
        return;
      }

      if (message?.type === 'ping') {
        send(socket, { type: 'pong', payload: { serverTime: new Date().toISOString() } });
      }
    });

    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));

    send(socket, {
      type: 'welcome',
      payload: {
        clientId,
        serverTime: new Date().toISOString(),
        user: user ? { id: user.id, name: user.name, email: user.email } : null,
        rule: getStatus(user?.id ?? null),
      },
    });
  });

  const heartbeat = setInterval(() => {
    for (const [socket, meta] of clients.entries()) {
      if (!meta.alive) {
        try { socket.terminate(); } catch {}
        clients.delete(socket);
        continue;
      }
      meta.alive = false;
      try { socket.ping(); } catch {}
    }
  }, 30000);
  heartbeat.unref?.();

  return {
    broadcast,
    clientCount: () => clients.size,
    close: () => new Promise((resolve) => {
      if (closed) return resolve();
      closed = true;
      clearInterval(heartbeat);
      for (const socket of clients.keys()) {
        try { socket.close(1001, 'Server shutting down'); } catch {}
      }
      wss.close(() => resolve());
    }),
  };
}
