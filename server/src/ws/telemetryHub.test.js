import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createTelemetryHub } from './telemetryHub.js';

const USERS = {
  'alice-token': { id: 'alice', name: 'Alice', email: 'alice@example.test' },
  'bob-token': { id: 'bob', name: 'Bob', email: 'bob@example.test' },
};

function connect(port, token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    socket.once('message', (raw) => {
      resolve({ socket, frame: JSON.parse(raw.toString()) });
    });
    socket.once('error', reject);
  });
}

test('welcome frame only contains the connected user rule status', async (t) => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const sockets = [];
  const hub = createTelemetryHub(server, {
    verifyToken: (token) => USERS[token] || null,
    getStatus: (userId) => ({
      count: userId === 'alice' ? 1 : 0,
      rules: userId === 'alice' ? [{ runtimeId: 'graph:alice', ownerId: 'alice' }] : [],
    }),
  });

  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await hub.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const port = server.address().port;
  const alice = await connect(port, 'alice-token');
  sockets.push(alice.socket);
  const bob = await connect(port, 'bob-token');
  sockets.push(bob.socket);

  assert.equal(alice.frame.type, 'welcome');
  assert.equal(alice.frame.payload.user.id, 'alice');
  assert.equal(alice.frame.payload.rule.count, 1);
  assert.equal(alice.frame.payload.rule.rules[0].runtimeId, 'graph:alice');

  assert.equal(bob.frame.type, 'welcome');
  assert.equal(bob.frame.payload.user.id, 'bob');
  assert.equal(bob.frame.payload.rule.count, 0);
  assert.deepEqual(bob.frame.payload.rule.rules, []);
});
