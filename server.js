const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "change-me";

app.use(cors());
app.use(express.json());

const db = new Database('database.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    name TEXT, lat REAL, lng REAL,
    accuracy REAL, battery INTEGER, timestamp INTEGER
  )
`);

function auth(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.post('/api/location', auth, (req, res) => {
  const { device_id, name, lat, lng, accuracy, battery } = req.body;
  if (!device_id || lat == null || lng == null)
    return res.status(400).json({ error: 'Missing fields' });

  db.prepare(`
    INSERT INTO devices (device_id, name, lat, lng, accuracy, battery, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      name=excluded.name, lat=excluded.lat, lng=excluded.lng,
      accuracy=excluded.accuracy, battery=excluded.battery, timestamp=excluded.timestamp
  `).run(device_id, name || 'Unknown', lat, lng, accuracy || 0, battery || -1, Date.now());

  res.json({ status: 'ok' });
});

app.get('/api/locations', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM devices').all());
});

app.listen(PORT, () => console.log('Server on port ' + PORT));