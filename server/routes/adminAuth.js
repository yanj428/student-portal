const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const {
  ADMIN_SESSION_IDLE_MINUTES,
  ADMIN_SESSION_ABSOLUTE_MINUTES,
  DUMMY_PASSWORD_HASH,
} = require('../config');
const { adminLoginLimiter } = require('../middleware/rateLimit');
const { sessionExpiredByAbsoluteLimit } = require('../middleware/auth');
const { lockedResponse, logout } = require('../utils/authResponses');

const router = express.Router();

// Admin lockout/attempt-log state shares the same login_throttle and
// login_attempts tables the student login uses, keyed under an "admin:"
// prefix so an admin username can never collide with (or borrow the lockout
// state of) a student account whose email happens to match the same text.
function throttleKey(username) {
  return `admin:${username.trim().toLowerCase()}`;
}

function completeLogin(req, res, admin) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    req.session.isAdmin = true;
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    req.session.loginAt = Date.now();
    req.session.cookie.maxAge = ADMIN_SESSION_IDLE_MINUTES * 60 * 1000;
    res.json({ ok: true, username: admin.username });
  });
}

router.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip;
  if (typeof password !== 'string' || (username !== undefined && typeof username !== 'string')) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  // Real multi-admin login identifies by username. If it's omitted and
  // there's exactly one admin account (true for every deployment until a
  // second admin is added), fall back to that one — this is what lets the
  // existing single-password login flow keep working unchanged for schools
  // that never need more than one admin.
  let admin;
  if (username) {
    admin = db.findAdminByUsername(username);
  } else if (db.adminCount() === 1) {
    admin = db.findAdminById(db.listAdmins()[0].id);
  }

  // The lockout key needs a real username even when one wasn't submitted
  // (the single-admin fallback above), so a lockout on "the omitted-username
  // path" and "that admin's real username" are the same lock, not two.
  const key = throttleKey(admin ? admin.username : username || 'unknown');

  const lockStatus = db.getLockStatus(key);
  if (lockStatus.locked) {
    return lockedResponse(res, key, ip, lockStatus.lockedUntil);
  }

  // Always run a real bcrypt comparison, even for a nonexistent admin —
  // against a fixed dummy hash — so this branch costs the same ~50ms a
  // real account's check would. Skipping bcrypt entirely for "no such
  // admin" would make that case return near-instantly, which combined with
  // the identical response body would still let response *timing* reveal
  // whether a given username has an admin account.
  const passwordMatches = bcrypt.compareSync(password, admin ? admin.passwordHash : DUMMY_PASSWORD_HASH);

  if (!admin || !passwordMatches) {
    const throttle = db.recordFailedAttempt(key);
    db.recordLoginAttempt({ email: key, ip, success: false, reason: admin ? 'bad_password' : 'unknown_username' });
    if (throttle.lockedUntil) {
      return lockedResponse(res, key, ip, throttle.lockedUntil);
    }
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  db.clearThrottle(key);
  db.recordLoginAttempt({ email: key, ip, success: true });
  db.logAuditEvent(admin.username, 'admin.login', null);
  completeLogin(req, res, admin);
});

router.post('/api/admin/logout', logout);

router.get('/api/admin/session', (req, res) => {
  const signedOut = { isAdmin: false, username: null, id: null, role: null };
  if (!req.session.isAdmin || sessionExpiredByAbsoluteLimit(req.session, ADMIN_SESSION_ABSOLUTE_MINUTES)) {
    return res.json(signedOut);
  }
  const admin = db.findAdminById(req.session.adminId);
  if (!admin) return res.json(signedOut);
  res.json({ isAdmin: true, username: admin.username, id: admin.id, role: admin.role });
});

module.exports = router;
