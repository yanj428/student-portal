const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function publicAdmin(admin) {
  return { id: admin.id, email: admin.email, createdAt: admin.createdAt };
}

router.get('/api/admin/admins', requireAdmin, (req, res) => {
  res.json({ admins: db.listAdmins() });
});

router.post('/api/admin/admins', requireAdmin, (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (db.findAdminByEmail(email)) return res.status(409).json({ error: 'An admin with this email already exists.' });

  const admin = db.createAdmin({ email, passwordHash: bcrypt.hashSync(password, 10) });
  db.logAuditEvent(req.session.adminEmail, 'admin.create', { createdEmail: admin.email });
  res.status(201).json({ admin: publicAdmin(admin) });
});

router.delete('/api/admin/admins/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.session.adminId) {
    return res.status(400).json({ error: "You can't remove your own admin account while logged in as it." });
  }
  if (db.adminCount() <= 1) {
    return res.status(400).json({ error: 'At least one admin account must remain.' });
  }
  const admin = db.findAdminById(req.params.id);
  if (!admin || !db.deleteAdmin(req.params.id)) return res.status(404).json({ error: 'Admin not found.' });

  db.logAuditEvent(req.session.adminEmail, 'admin.delete', { deletedEmail: admin.email });
  res.json({ ok: true });
});

router.post('/api/admin/change-password', requireAdmin, (req, res) => {
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
  db.logAuditEvent(admin.email, 'admin.password_change', null);
  res.json({ ok: true });
});

module.exports = router;
