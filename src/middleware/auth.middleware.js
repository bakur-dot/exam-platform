'use strict';

require('dotenv').config();
const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

/**
 * Verifies the Bearer access token and attaches `req.user` with the JWT payload.
 * req.user shape: { sub, roleId, roleName, type, iat, exp }
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required.' });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), ACCESS_SECRET);
    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Role-based guard. Use after requireAuth.
 * Example: router.delete('/users/:id', requireAuth, requireRole('SuperAdmin'), handler)
 */
function requireRole(...roleNames) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!roleNames.includes(req.user.roleName)) {
      return res.status(403).json({ error: `Access restricted to: ${roleNames.join(', ')}.` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
