require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./src/db');
const authRoutes = require('./src/routes/auth');
const familyRoutes = require('./src/routes/family');
const locationRoutes = require('./src/routes/location');
const { requireAuth } = require('./src/middleware/auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || '';

if (process.env.NODE_ENV === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random secret of at least 32 characters in production.');
}
if (!jwtSecret) {
  console.warn('WARNING: JWT_SECRET is not set. Set it in .env before using this server.');
}

const origins = (process.env.CORS_ORIGINS || '*').split(',').map(x => x.trim());
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origins.includes('*') || origins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '20kb' }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' }
});
app.use(generalLimiter);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'Family Track API', version: '2.0.0' }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/family', requireAuth, familyRoutes);
app.use('/api/location', requireAuth, locationRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, _req, res, _next) => {
  if (err && err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error(err);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Family Track API v2.0 running on port ${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
