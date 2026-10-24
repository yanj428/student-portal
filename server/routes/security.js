const express = require('express');

const db = require('../db');
const { fullName } = require('../utils/studentName');
const { requireOwnerAdmin } = require('../middleware/auth');

const router = express.Router();

function publicLockedEntry(entry) {
  return {
    email: entry.email,
    lockedUntil: entry.lockedUntil,
    lockoutCount: entry.lockoutCount,
    adminLocked: entry.adminLocked,
    student: entry.student
      ? { id: entry.student.id, fullName: fullName(entry.student) }
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

// A negative LIMIT means "no limit" to SQLite, so anything below 1 is ignored
// rather than passed through.
function parseLimit(value) {
  const n = parseInt(value, 10);
  return n >= 1 ? n : undefined;
}

router.get('/api/admin/security/attempts', requireOwnerAdmin, (req, res) => {
  const { email, ip, limit } = req.query;
  res.json({ attempts: db.listLoginAttempts({ email, ip, limit: parseLimit(limit) }) });
});

router.get('/api/admin/security/audit-log', requireOwnerAdmin, (req, res) => {
  res.json({ auditLog: db.listAuditLog({ limit: parseLimit(req.query.limit) }) });
});

module.exports = router;
