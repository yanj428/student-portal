const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { requireAdmin, requireOwnerAdmin } = require('../middleware/auth');
const { passwordChangeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

function isValidUsername(username) {
  return typeof username === 'string' && /^[A-Za-z0-9._-]{3,32}$/.test(username.trim());
}

function publicAdmin(admin) {
  return { id: admin.id, username: admin.username, role: admin.role, createdAt: admin.createdAt };
}

// ---- Admin account management (owner only) ----

router.get('/api/admin/admins', requireOwnerAdmin, (req, res) => {
  res.json({ admins: db.listAdmins() });
});

router.post('/api/admin/admins', requireOwnerAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, dots, underscores, hyphens).' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (role !== undefined && role !== 'owner' && role !== 'editor') {
    return res.status(400).json({ error: 'Role must be "owner" or "editor".' });
  }
  if (db.findAdminByUsername(username)) return res.status(409).json({ error: 'An admin with this username already exists.' });

  const admin = db.createAdmin({ username, passwordHash: bcrypt.hashSync(password, 10), role });
  db.logAuditEvent(req.session.adminUsername, 'admin.create', { createdUsername: admin.username, role: admin.role });
  res.status(201).json({ admin: publicAdmin(admin) });
});

router.patch('/api/admin/admins/:id/role', requireOwnerAdmin, (req, res) => {
  const { role } = req.body || {};
  if (role !== 'owner' && role !== 'editor') return res.status(400).json({ error: 'Role must be "owner" or "editor".' });

  const admin = db.findAdminById(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  if (admin.role === 'owner' && role === 'editor' && db.ownerCount() <= 1) {
    return res.status(400).json({ error: 'At least one owner admin must remain.' });
  }

  db.updateAdminRole(admin.id, role);
  db.logAuditEvent(req.session.adminUsername, 'admin.role_change', { username: admin.username, role });
  res.json({ ok: true });
});

router.delete('/api/admin/admins/:id', requireOwnerAdmin, (req, res) => {
  if (req.params.id === req.session.adminId) {
    return res.status(400).json({ error: "You can't remove your own admin account while logged in as it." });
  }
  if (db.adminCount() <= 1) {
    return res.status(400).json({ error: 'At least one admin account must remain.' });
  }
  const admin = db.findAdminById(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });
  if (admin.role === 'owner' && db.ownerCount() <= 1) {
    return res.status(400).json({ error: 'At least one owner admin must remain.' });
  }
  db.deleteAdmin(req.params.id);

  // Without this, a deleted admin's existing session would keep working
  // until requireAdmin's next per-request existence check catches it — this
  // ends it immediately instead of leaving that window open at all.
  db.destroyAdminSessions(admin.id);
  db.logAuditEvent(req.session.adminUsername, 'admin.delete', { deletedUsername: admin.username });
  res.json({ ok: true });
});

// ---- Self-service: any admin manages their own password ----

router.post('/api/admin/change-password', passwordChangeLimiter, requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const admin = db.findAdminById(req.session.adminId);
  if (!admin) return res.status(401).json({ error: 'Not logged in.' });
  if (!bcrypt.compareSync(currentPassword, admin.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  db.updateAdminPasswordHash(admin.id, bcrypt.hashSync(newPassword, 10));
  db.destroyOtherAdminSessions(admin.id, req.sessionID);
  db.logAuditEvent(admin.username, 'admin.password_change', null);
  res.json({ ok: true });
});

module.exports = router;
