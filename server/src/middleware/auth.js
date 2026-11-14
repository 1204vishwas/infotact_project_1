import { verifyToken } from '../services/authService.js';

function readBearerToken(req) {
  const header = String(req.headers?.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

export function requireAuth(req, res, next) {
  const user = verifyToken(readBearerToken(req));
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  return next();
}

export function optionalAuth(req, _res, next) {
  req.user = verifyToken(readBearerToken(req));
  return next();
}
