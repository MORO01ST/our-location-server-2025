# Family Track Server 2.0

Backend for a **consent-based** family location-sharing Android app. This release adds accounts, family groups, one-use invitations, per-member location consent, and family-scoped location access.

## Requirements

- Node.js 18 or newer
- npm
- A persistent disk for the SQLite database

## Install and run

```bash
npm install
```

Copy `.env.example` to `.env`, then set a strong secret:

```bash
# Linux/macOS
cp .env.example .env
# Windows PowerShell
Copy-Item .env.example .env
```

Generate a secret with Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Put the generated value in `JWT_SECRET` in `.env`. Then run:

```bash
npm start
```

Health check: `GET http://localhost:3000/health`

## Important security and privacy behavior

- Every account has its own email/password and JWT bearer token.
- Passwords are hashed with bcrypt.
- A user can belong to one family at a time.
- Family invitation codes are single-use and expire (default 48 hours).
- Location sharing is OFF by default. Each member must enable it.
- Turning sharing OFF deletes that member's last stored location.
- Location reads are limited to the caller's own family and opted-in members.
- The server uses HTTPS when deployed behind a correctly configured HTTPS host. Never send real location data over plain public HTTP.
- Do not commit `.env`, database files, passwords, or tokens to GitHub.

## API

All protected routes require:

`Authorization: Bearer YOUR_JWT_TOKEN`

### Authentication

`POST /api/auth/register`

```json
{ "email": "person@example.com", "display_name": "Alex", "password": "at-least-10-characters" }
```

`POST /api/auth/login`

```json
{ "email": "person@example.com", "password": "your-password" }
```

`GET /api/auth/me` — current account (protected).

### Families

`POST /api/family`

```json
{ "name": "My Family" }
```

Creates a family; creator becomes owner.

`GET /api/family` — current family and member list.

`POST /api/family/invitations` — owner/admin only:

```json
{ "family_id": "FAMILY_ID", "valid_hours": 48 }
```

The response contains a one-use invitation code. Share it privately.

`POST /api/family/join`

```json
{ "invitation_code": "CODE_FROM_OWNER" }
```

`PATCH /api/family/sharing`

```json
{ "enabled": true }
```

Use `false` to stop sharing and delete the last saved location.

`DELETE /api/family/members/USER_ID` — owner/admin removes a member. An admin cannot remove another admin or the owner.

`POST /api/family/leave` — a non-owner leaves the family.

### Locations

`POST /api/location`

```json
{ "latitude": 36.7525, "longitude": 3.0420, "accuracy": 15, "battery": 82 }
```

The authenticated account is used as the device identity; clients cannot submit another user's ID.

`GET /api/location` — locations of opted-in members of the caller's family only.

## Quick test with curl

Register and save the returned token as `TOKEN`:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","display_name":"Owner","password":"correct-horse-battery"}'
```

Use the token to create a family:

```bash
curl -X POST http://localhost:3000/api/family \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Family"}'
```

Create an invitation using the returned family ID, then the invited account registers and joins using the code. Each member must call `PATCH /api/family/sharing` with `{"enabled":true}` before sending location updates.

## Deployment notes

SQLite is appropriate for a small initial deployment only when the host provides a **persistent disk** and the `DB_PATH` points to it. Many free hosting plans have ephemeral storage or sleep when idle. If the database file is ephemeral, accounts and locations can disappear after restart/redeploy. Do not use such a host for real family tracking. For a free host without persistent disk, migrate to a managed PostgreSQL database before deployment.

Set `NODE_ENV=production`, a strong `JWT_SECRET`, `DB_PATH` to the persistent disk, and `CORS_ORIGINS` to the exact web dashboard origin (or `*` only if there is no browser dashboard and you understand the implications). Deploy behind HTTPS.

## Version 2.0 limitations / next steps

- No password reset or email verification yet.
- No ownership transfer or family deletion endpoint yet.
- No WebSocket push yet; the Android app can poll the protected location endpoint at a sensible interval while actively sharing.
- This server does not secretly track devices. Android must request OS location permissions and clearly show the sharing state.
- Before public production use, add automated tests, audit logs, account deletion, and a retention policy.
