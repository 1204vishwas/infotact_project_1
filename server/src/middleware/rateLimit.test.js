import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, resetRateLimits } from './rateLimit.js';

function request(ip) {
  return { ip, socket: { remoteAddress: ip } };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('allows requests up to the limit and then returns 429', () => {
  resetRateLimits();
  const middleware = rateLimit({ windowMs: 60_000, max: 2, keyPrefix: 'test' });

  let nextCalls = 0;
  for (let i = 0; i < 2; i += 1) {
    const res = response();
    middleware(request('10.0.0.1'), res, () => { nextCalls += 1; });
    assert.equal(res.statusCode, 200);
  }

  const blocked = response();
  middleware(request('10.0.0.1'), blocked, () => { nextCalls += 1; });
  assert.equal(blocked.statusCode, 429);
  assert.equal(nextCalls, 2);
  const retryAfter = Number(blocked.headers['Retry-After']);
  assert.ok(retryAfter >= 1 && retryAfter <= 60, `unexpected Retry-After ${retryAfter}`);
});

test('counts each IP and prefix separately', () => {
  resetRateLimits();
  const first = rateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'a' });
  const second = rateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'b' });

  const one = response();
  first(request('10.0.0.2'), one, () => {});
  assert.equal(one.statusCode, 200);

  const otherIp = response();
  first(request('10.0.0.3'), otherIp, () => {});
  assert.equal(otherIp.statusCode, 200);

  const otherPrefix = response();
  second(request('10.0.0.2'), otherPrefix, () => {});
  assert.equal(otherPrefix.statusCode, 200);

  const blocked = response();
  first(request('10.0.0.2'), blocked, () => {});
  assert.equal(blocked.statusCode, 429);
});
