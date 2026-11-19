/**
 * Small in-memory fixed-window rate limiter. It keeps the auth endpoints from
 * being brute-forced without pulling in a Redis dependency; each process keeps
 * its own counters, which is sufficient for this single-node deployment.
 */
const buckets = new Map();

function sweep(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, keyPrefix = 'default' } = {}) {
  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    if (buckets.size > 1000) sweep(now);

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }

    return next();
  };
}

export function resetRateLimits() {
  buckets.clear();
}
