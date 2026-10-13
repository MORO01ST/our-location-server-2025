# Our Location Server

Backend server for a consensual family GPS tracker.

## Features
- Receives location updates (lat, lng, accuracy, battery)
- Stores data in SQLite
- Serves latest locations via REST API

## Endpoints
- `POST /api/location` — receive location update
- `GET /api/locations` — get all devices

## Setup
```bash
npm install
npm start