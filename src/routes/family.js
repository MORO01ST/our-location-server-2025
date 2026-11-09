const express = require('express');
const db = require('../db');
const { makeId, hashCode, makeInviteCode, cleanString } = require('../utils');

const router = express.Router();

function membership(familyId, userId) {
  return db.prepare('SELECT * FROM family_members WHERE family_id = ? AND user_id = ?').get(familyId, userId);
}
function canManage(member) {
  return member && (member.role === 'owner' || member.role === 'admin');
}

router.post('/', (req, res) => {
  const name = cleanString(req.body.name, 80);
  if (name.length < 2) return res.status(400).json({ error: 'Family name must be at least 2 characters' });
  const existing = db.prepare('SELECT family_id FROM family_members WHERE user_id = ?').get(req.user.id);
  if (existing) return res.status(409).json({ error: 'You are already in a family. Leave it before creating another.' });

  const familyId = makeId();
  const now = Date.now();
  const create = db.transaction(() => {
    db.prepare('INSERT INTO families (id,name,owner_id,created_at) VALUES (?,?,?,?)').run(familyId, name, req.user.id, now);
    db.prepare(`INSERT INTO family_members (family_id,user_id,role,sharing_enabled,joined_at)
      VALUES (?,?, 'owner', 0, ?)`).run(familyId, req.user.id, now);
  });
  create();
  res.status(201).json({ family: { id: familyId, name, owner_id: req.user.id, created_at: now } });
});

router.get('/', (req, res) => {
  const family = db.prepare(`
    SELECT f.id,f.name,f.owner_id,f.created_at,m.role,m.sharing_enabled
    FROM family_members m JOIN families f ON f.id=m.family_id
    WHERE m.user_id=?
  `).get(req.user.id);
  if (!family) return res.json({ family: null, members: [] });

  const members = db.prepare(`
    SELECT u.id,u.display_name,m.role,m.sharing_enabled,m.joined_at,
      CASE WHEN l.user_id IS NULL THEN NULL ELSE l.updated_at END AS location_updated_at
    FROM family_members m JOIN users u ON u.id=m.user_id
    LEFT JOIN locations l ON l.user_id=u.id
    WHERE m.family_id=? ORDER BY m.joined_at ASC
  `).all(family.id);
  res.json({ family, members });
});

router.post('/invitations', (req, res) => {
  const familyId = cleanString(req.body.family_id, 80);
  const member = membership(familyId, req.user.id);
  if (!canManage(member)) return res.status(403).json({ error: 'Only family owners or admins can create invitations' });

  const hours = Number(req.body.valid_hours || 48);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
    return res.status(400).json({ error: 'valid_hours must be between 1 and 168' });
  }
  const code = makeInviteCode();
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  db.prepare(`INSERT INTO invitations (id,family_id,code_hash,created_by,expires_at,max_uses,uses,created_at)
    VALUES (?,?,?,?,?,1,0,?)`).run(makeId(), familyId, hashCode(code), req.user.id, expiresAt, Date.now());

  res.status(201).json({ invitation_code: code, expires_at: expiresAt, max_uses: 1 });
});

router.post('/join', (req, res) => {
  const code = cleanString(req.body.invitation_code, 30).toUpperCase();
  if (!code) return res.status(400).json({ error: 'invitation_code is required' });
  if (db.prepare('SELECT family_id FROM family_members WHERE user_id=?').get(req.user.id)) {
    return res.status(409).json({ error: 'You are already in a family' });
  }
  const invite = db.prepare('SELECT * FROM invitations WHERE code_hash=?').get(hashCode(code));
  if (!invite || invite.expires_at < Date.now() || invite.uses >= invite.max_uses) {
    return res.status(400).json({ error: 'Invitation is invalid, expired, or already used' });
  }
  const join = db.transaction(() => {
    db.prepare(`INSERT INTO family_members (family_id,user_id,role,sharing_enabled,joined_at)
      VALUES (?,?,'member',0,?)`).run(invite.family_id, req.user.id, Date.now());
    db.prepare('UPDATE invitations SET uses=uses+1 WHERE id=?').run(invite.id);
  });
  join();
  res.json({ status: 'joined', family_id: invite.family_id, sharing_enabled: false });
});

router.patch('/sharing', (req, res) => {
  if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false' });
  const member = db.prepare('SELECT family_id FROM family_members WHERE user_id=?').get(req.user.id);
  if (!member) return res.status(409).json({ error: 'Join a family first' });
  db.prepare('UPDATE family_members SET sharing_enabled=? WHERE family_id=? AND user_id=?')
    .run(req.body.enabled ? 1 : 0, member.family_id, req.user.id);
  if (!req.body.enabled) db.prepare('DELETE FROM locations WHERE user_id=?').run(req.user.id);
  res.json({ sharing_enabled: req.body.enabled, location_deleted: !req.body.enabled });
});

router.delete('/members/:userId', (req, res) => {
  const family = db.prepare('SELECT family_id FROM family_members WHERE user_id=?').get(req.user.id);
  if (!family) return res.status(409).json({ error: 'You are not in a family' });
  const requester = membership(family.family_id, req.user.id);
  const target = membership(family.family_id, req.params.userId);
  if (!canManage(requester)) return res.status(403).json({ error: 'Insufficient permissions' });
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.role === 'owner') return res.status(400).json({ error: 'The family owner cannot be removed' });
  if (requester.role === 'admin' && target.role === 'admin') return res.status(403).json({ error: 'Admins cannot remove other admins' });

  db.prepare('DELETE FROM family_members WHERE family_id=? AND user_id=?').run(family.family_id, req.params.userId);
  db.prepare('DELETE FROM locations WHERE user_id=?').run(req.params.userId);
  res.json({ status: 'removed' });
});

router.post('/leave', (req, res) => {
  const member = db.prepare('SELECT family_id,role FROM family_members WHERE user_id=?').get(req.user.id);
  if (!member) return res.status(409).json({ error: 'You are not in a family' });
  if (member.role === 'owner') return res.status(400).json({ error: 'Transfer ownership or delete the family before leaving' });
  db.prepare('DELETE FROM family_members WHERE family_id=? AND user_id=?').run(member.family_id, req.user.id);
  db.prepare('DELETE FROM locations WHERE user_id=?').run(req.user.id);
  res.json({ status: 'left' });
});

module.exports = router;
