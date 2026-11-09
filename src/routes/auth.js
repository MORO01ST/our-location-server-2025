const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { makeId, cleanString } = require('../utils');

const router = express.Router();

function issueToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: userId,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

router.post('/register', async (req, res, next) => {
  try {
    const email = cleanString(req.body.email, 254).toLowerCase();
    const displayName = cleanString(req.body.display_name, 60);
    const password = req.body.password;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (displayName.length < 2) return res.status(400).json({ error: 'Display name must be at least 2 characters' });
    if (typeof password !== 'string' || password.length < 10 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be 10 to 72 characters' });
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const id = makeId();
    const passwordHash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users (id,email,display_name,password_hash,created_at) VALUES (?,?,?,?,?)')
      .run(id, email, displayName, passwordHash, Date.now());

    return res.status(201).json({
      token: issueToken(id),
      user: { id, email, display_name: displayName }
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Email is already registered' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = cleanString(req.body.email, 254).toLowerCase();
    const password = req.body.password;
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required' });

    const user = db.prepare('SELECT id,email,display_name,password_hash FROM users WHERE email = ?').get(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    return res.json({
      token: issueToken(user.id),
      user: { id: user.id, email: user.email, display_name: user.display_name }
    });
  } catch (err) { next(err); }
});

router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  const user = db.prepare('SELECT id,email,display_name,created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
