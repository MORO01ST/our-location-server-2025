const crypto = require('crypto');

function makeId() {
  return crypto.randomUUID();
}
function hashCode(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function makeInviteCode() {
  // Human-friendly uppercase code; only its SHA-256 hash is stored.
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}
function cleanString(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
module.exports = { makeId, hashCode, makeInviteCode, cleanString };
