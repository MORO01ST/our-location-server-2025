const express = require('express');
const db = require('../db');

const router = express.Router();

function currentMembership(userId) {
  return db.prepare('SELECT family_id,sharing_enabled FROM family_members WHERE user_id=?').get(userId);
}

router.post('/', (req, res) => {
  const member = currentMembership(req.user.id);
  if (!member) return res.status(409).json({ error: 'Join a family before sharing location' });
  if (!member.sharing_enabled) return res.status(403).json({ error: 'Enable location sharing first' });

  const { latitude, longitude, accuracy, battery } = req.body;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Valid numeric latitude and longitude are required' });
  }
  if (accuracy != null && (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000)) {
    return res.status(400).json({ error: 'accuracy must be between 0 and 10000 meters' });
  }
  if (battery != null && (!Number.isInteger(battery) || battery < -1 || battery > 100)) {
    return res.status(400).json({ error: 'battery must be -1 or an integer from 0 to 100' });
  }

  const updatedAt = Date.now();
  db.prepare(`INSERT INTO locations (user_id,latitude,longitude,accuracy,battery,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      latitude=excluded.latitude, longitude=excluded.longitude,
      accuracy=excluded.accuracy, battery=excluded.battery, updated_at=excluded.updated_at`)
    .run(req.user.id, latitude, longitude, accuracy ?? null, battery ?? -1, updatedAt);

  res.json({ status: 'ok', updated_at: updatedAt });
});

router.get('/', (req, res) => {
  const member = currentMembership(req.user.id);
  if (!member) return res.status(409).json({ error: 'Join a family first' });

  // Only opted-in family members are returned; the caller must belong to the same family.
  const locations = db.prepare(`
    SELECT u.id AS user_id,u.display_name,l.latitude,l.longitude,l.accuracy,l.battery,l.updated_at
    FROM family_members m
    JOIN users u ON u.id=m.user_id
    JOIN locations l ON l.user_id=u.id
    WHERE m.family_id=? AND m.sharing_enabled=1
    ORDER BY l.updated_at DESC
  `).all(member.family_id);
  res.json({ locations });
});

module.exports = router;
