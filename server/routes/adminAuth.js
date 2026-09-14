const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { ADMIN_SESSION_IDLE_MINUTES } = require('../config');
const { adminLoginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (typeof password !== 'string') {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  // Real multi-admin login identifies by email. If it's omitted and there's
  // exactly one admin account (true for every deployment until a second
  // admin is added), fall back to that one — this is what lets the existing
  // single-password login flow keep working unchanged for schools that
  // never need more than one admin.
  let admin;
  if (email) {
    admin = db.findAdminByEmail(email);
  } else if (db.adminCount() === 1) {
    admin = db.findAdminByEmail(db.listAdmins()[0].email);
  }

  if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    req.session.isAdmin = true;
    req.session.adminId = admin.id;
    req.session.adminEmail = admin.email;
    req.session.loginAt = Date.now();
    req.session.cookie.maxAge = ADMIN_SESSION_IDLE_MINUTES * 60 * 1000;
    db.logAuditEvent(admin.email, 'admin.login', null);
    res.json({ ok: true, email: admin.email });
  });
});

router.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('kpis.sid');
    res.json({ ok: true });
  });
});

router.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin, email: req.session.adminEmail || null, id: req.session.adminId || null });
});

module.exports = router;
