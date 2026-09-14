const express = require('express');

const db = require('../db');
const { requireOwnerAdmin } = require('../middleware/auth');

const router = express.Router();

function publicLockedEntry(entry) {
  return {
    email: entry.email,
    lockedUntil: entry.lockedUntil,
    lockoutCount: entry.lockoutCount,
    adminLocked: entry.adminLocked,
    student: entry.student
      ? { id: entry.student.id, firstName: entry.student.firstName, lastName: entry.student.lastName }
      : null,
  };
}

router.get('/api/admin/security/locked', requireOwnerAdmin, (req, res) => {
  res.json({ locked: db.listLockedAccounts().map(publicLockedEntry) });
});

router.post('/api/admin/security/unlock', requireOwnerAdmin, (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  db.unlockEmail(email);
  db.logAuditEvent(req.session.adminUsername, 'security.unlock', { email });
  res.json({ ok: true });
});

router.post('/api/admin/security/unlock-all', requireOwnerAdmin, (req, res) => {
  db.unlockAllLocked();
  db.logAuditEvent(req.session.adminUsername, 'security.unlock_all', null);
  res.json({ ok: true });
});

router.get('/api/admin/security/attempts', requireOwnerAdmin, (req, res) => {
  const { email, ip, limit } = req.query;
  const attempts = db.listLoginAttempts({ email, ip, limit: limit ? parseInt(limit, 10) : undefined });
  res.json({ attempts });
});

router.get('/api/admin/security/audit-log', requireOwnerAdmin, (req, res) => {
  const { limit } = req.query;
  res.json({ auditLog: db.listAuditLog({ limit: limit ? parseInt(limit, 10) : undefined }) });
});

module.exports = router;
