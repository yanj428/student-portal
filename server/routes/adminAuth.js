const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');

const db = require('../db');
const { ADMIN_SESSION_IDLE_MINUTES, ACCOUNT_LOCKED_MESSAGE, DUMMY_PASSWORD_HASH } = require('../config');
const { adminLoginLimiter } = require('../middleware/rateLimit');
const { hashRecoveryCode } = require('../utils/twoFactor');

const router = express.Router();

const PENDING_TOTP_WINDOW_MS = 5 * 60 * 1000;

// Admin lockout/attempt-log state shares the same login_throttle and
// login_attempts tables the student login uses, keyed under an "admin:"
// prefix so an admin email can never collide with (or borrow the lockout
// state of) a student account that happens to share the same address.
function throttleKey(email) {
  return `admin:${email.trim().toLowerCase()}`;
}

function minutesUntil(isoTimestamp) {
  return Math.max(1, Math.ceil((new Date(isoTimestamp).getTime() - Date.now()) / 60000));
}

function lockedResponse(res, key, ip, lockedUntil) {
  db.recordLoginAttempt({ email: key, ip, success: false, reason: 'locked' });
  const retryAfterMinutes = lockedUntil ? minutesUntil(lockedUntil) : null;
  return res.status(403).json({
    error: retryAfterMinutes
      ? `${ACCOUNT_LOCKED_MESSAGE} You can try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`
      : ACCOUNT_LOCKED_MESSAGE,
    locked: true,
    retryAfterMinutes,
  });
}

function completeLogin(req, res, admin) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    req.session.isAdmin = true;
    req.session.adminId = admin.id;
    req.session.adminEmail = admin.email;
    req.session.loginAt = Date.now();
    req.session.cookie.maxAge = ADMIN_SESSION_IDLE_MINUTES * 60 * 1000;
    res.json({ ok: true, email: admin.email });
  });
}

router.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const ip = req.ip;
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

  // The lockout key needs a real email even when one wasn't submitted (the
  // single-admin fallback above), so a lockout on "the omitted-email path"
  // and "that admin's real email" are the same lock, not two.
  const key = throttleKey(admin ? admin.email : email || 'unknown');

  const lockStatus = db.getLockStatus(key);
  if (lockStatus.locked) {
    return lockedResponse(res, key, ip, lockStatus.lockedUntil);
  }

  // Always run a real bcrypt comparison, even for a nonexistent admin —
  // against a fixed dummy hash — so this branch costs the same ~50ms a
  // real account's check would. Skipping bcrypt entirely for "no such
  // admin" would make that case return near-instantly, which combined with
  // the identical response body would still let response *timing* reveal
  // whether a given email has an admin account.
  const passwordMatches = bcrypt.compareSync(password, admin ? admin.passwordHash : DUMMY_PASSWORD_HASH);

  if (!admin || !passwordMatches) {
    const throttle = db.recordFailedAttempt(key);
    db.recordLoginAttempt({ email: key, ip, success: false, reason: admin ? 'bad_password' : 'unknown_email' });
    if (throttle.lockedUntil) {
      return lockedResponse(res, key, ip, throttle.lockedUntil);
    }
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  // Password alone isn't enough for a 2FA-enabled admin — regenerate the
  // session now (so the pending state itself can't be fixated) but hold
  // off on granting isAdmin until a valid code follows.
  if (admin.totpEnabled) {
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Could not start a session.' });
      req.session.pending2faAdminId = admin.id;
      req.session.pending2faExpiresAt = Date.now() + PENDING_TOTP_WINDOW_MS;
      res.json({ ok: true, requiresTotp: true });
    });
    return;
  }

  db.clearThrottle(key);
  db.recordLoginAttempt({ email: key, ip, success: true });
  db.logAuditEvent(admin.email, 'admin.login', null);
  completeLogin(req, res, admin);
});

router.post('/api/admin/login/verify-totp', adminLoginLimiter, (req, res) => {
  const { code, recoveryCode } = req.body || {};
  const ip = req.ip;
  const pendingId = req.session.pending2faAdminId;
  const expiresAt = req.session.pending2faExpiresAt;

  if (!pendingId || !expiresAt || Date.now() > expiresAt) {
    delete req.session.pending2faAdminId;
    delete req.session.pending2faExpiresAt;
    return res.status(401).json({ error: 'No pending login, or it expired. Please log in again.' });
  }

  const admin = db.findAdminById(pendingId);
  if (!admin) {
    delete req.session.pending2faAdminId;
    delete req.session.pending2faExpiresAt;
    return res.status(401).json({ error: 'This admin account no longer exists.' });
  }

  const key = throttleKey(admin.email);
  const lockStatus = db.getLockStatus(key);
  if (lockStatus.locked) {
    return lockedResponse(res, key, ip, lockStatus.lockedUntil);
  }

  let usedRecovery = false;
  let valid = false;
  if (typeof code === 'string' && code.trim()) {
    valid = authenticator.check(code.trim(), admin.totpSecret);
  } else if (typeof recoveryCode === 'string' && recoveryCode.trim()) {
    valid = db.consumeRecoveryCode(admin.id, hashRecoveryCode(recoveryCode));
    usedRecovery = valid;
  }

  if (!valid) {
    const throttle = db.recordFailedAttempt(key);
    db.recordLoginAttempt({ email: key, ip, success: false, reason: 'bad_totp' });
    if (throttle.lockedUntil) {
      return lockedResponse(res, key, ip, throttle.lockedUntil);
    }
    return res.status(401).json({ error: 'Incorrect code.' });
  }

  delete req.session.pending2faAdminId;
  delete req.session.pending2faExpiresAt;
  db.clearThrottle(key);
  db.recordLoginAttempt({ email: key, ip, success: true, reason: usedRecovery ? 'recovery_code' : undefined });
  db.logAuditEvent(admin.email, 'admin.login', usedRecovery ? { recoveryCode: true } : { totp: true });
  completeLogin(req, res, admin);
});

router.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('kpis.sid');
    res.json({ ok: true });
  });
});

router.get('/api/admin/session', (req, res) => {
  if (!req.session.isAdmin) {
    return res.json({ isAdmin: false, email: null, id: null, role: null });
  }
  const admin = db.findAdminById(req.session.adminId);
  res.json({
    isAdmin: true,
    email: req.session.adminEmail || null,
    id: req.session.adminId || null,
    role: admin ? admin.role : null,
    totpEnabled: admin ? !!admin.totpEnabled : false,
  });
});

module.exports = router;
