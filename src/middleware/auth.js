const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Authentication required' });

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(503).json({ error: 'Server authentication is not configured' });
    const payload = jwt.verify(match[1], secret);
    req.user = { id: payload.sub };
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
module.exports = { requireAuth };
