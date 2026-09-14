const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { requireStudent, publicStudent } = require('../middleware/auth');
const { studentLoginLimiter, passwordChangeLimiter } = require('../middleware/rateLimit');
const { DEFAULT_STUDENT_PASSWORD, ACCOUNT_LOCKED_MESSAGE } = require('../config');

const router = express.Router();

function minutesUntil(isoTimestamp) {
  return Math.max(1, Math.ceil((new Date(isoTimestamp).getTime() - Date.now()) / 60000));
}

function lockedResponse(res, email, ip, lockedUntil) {
  db.recordLoginAttempt({ email, ip, success: false, reason: 'locked' });
  const retryAfterMinutes = lockedUntil ? minutesUntil(lockedUntil) : null;
  return res.status(403).json({
    error: retryAfterMinutes
      ? `${ACCOUNT_LOCKED_MESSAGE} You can try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`
      : ACCOUNT_LOCKED_MESSAGE,
    locked: true,
    retryAfterMinutes,
  });
}

router.post('/api/login', studentLoginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const ip = req.ip;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // Checked before looking the account up, and with the same response
  // either way — this is what keeps a lockout from doubling as a way to
  // find out which emails have accounts (see db.js's login_throttle table).
  const lockStatus = db.getLockStatus(email);
  if (lockStatus.locked) {
    return lockedResponse(res, email, ip, lockStatus.lockedUntil);
  }

  const student = db.findByEmail(email);
  if (!student || !bcrypt.compareSync(password, student.passwordHash)) {
    const throttle = db.recordFailedAttempt(email);
    db.recordLoginAttempt({ email, ip, success: false, reason: student ? 'bad_password' : 'unknown_email' });
    if (throttle.lockedUntil) {
      return lockedResponse(res, email, ip, throttle.lockedUntil);
    }
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  db.clearThrottle(email);
  db.recordLoginAttempt({ email, ip, success: true });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    req.session.studentId = student.id;
    res.json({ student: publicStudent(student) });
  });
});

router.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('kpis.sid');
    res.json({ ok: true });
  });
});

router.get('/api/me', requireStudent, (req, res) => {
  const student = db.findById(req.session.studentId);
  if (!student) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ student: publicStudent(student) });
});

router.post('/api/change-password', passwordChangeLimiter, requireStudent, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  if (newPassword === DEFAULT_STUDENT_PASSWORD) {
    return res.status(400).json({ error: "You can't use the default password. Please choose a different password." });
  }

  const student = db.findById(req.session.studentId);
  if (!student) return res.status(401).json({ error: 'Not logged in.' });

  if (!bcrypt.compareSync(currentPassword, student.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (bcrypt.compareSync(newPassword, student.passwordHash)) {
    return res.status(400).json({ error: 'New password must be different from your current password.' });
  }

  db.updateStudentPasswordHash(student.id, bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

module.exports = router;
