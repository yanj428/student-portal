const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { requireStudent, publicStudent } = require('../middleware/auth');
const { studentLoginLimiter, passwordChangeLimiter } = require('../middleware/rateLimit');
const { lockedResponse } = require('../utils/authResponses');
const { snapshotRole, logoutRole } = require('../utils/sessionRoles');
const {
  DEFAULT_STUDENT_PASSWORD,
  STUDENT_SESSION_IDLE_MINUTES,
  ADMIN_SESSION_IDLE_MINUTES,
  DUMMY_PASSWORD_HASH,
} = require('../config');

const router = express.Router();

router.post('/api/login', studentLoginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const ip = req.ip;

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
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
  // Always run a real bcrypt comparison, even for an unknown email — against
  // a fixed dummy hash — so this branch takes the same ~50ms a real
  // account's check would. Otherwise "no such student" returns near-
  // instantly while a real account's wrong-password check doesn't, and
  // that timing difference reveals which emails have accounts even though
  // the response bodies are identical.
  const passwordMatches = bcrypt.compareSync(password, student ? student.passwordHash : DUMMY_PASSWORD_HASH);
  if (!student || !passwordMatches) {
    const throttle = db.recordFailedAttempt(email);
    db.recordLoginAttempt({ email, ip, success: false, reason: student ? 'bad_password' : 'unknown_email' });
    if (throttle.lockedUntil) {
      return lockedResponse(res, email, ip, throttle.lockedUntil);
    }
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  db.clearThrottle(email);
  db.recordLoginAttempt({ email, ip, success: true });
  // An admin signed in on this same browser stays signed in.
  const admin = snapshotRole(req.session, 'admin');
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    Object.assign(req.session, admin);
    req.session.studentId = student.id;
    req.session.studentLoginAt = Date.now();
    req.session.cookie.maxAge = Math.max(STUDENT_SESSION_IDLE_MINUTES, admin.isAdmin ? ADMIN_SESSION_IDLE_MINUTES : 0) * 60 * 1000;
    res.json({ student: publicStudent(student) });
  });
});

// Signs out the student only; an admin signed in on this browser stays that way.
router.post('/api/logout', logoutRole('student'));

router.get('/api/me', requireStudent, (req, res) => {
  res.json({ student: publicStudent(req.student) });
});

router.post('/api/change-password', requireStudent, passwordChangeLimiter, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  if (newPassword === DEFAULT_STUDENT_PASSWORD) {
    return res.status(400).json({ error: "You can't use the default password. Please choose a different password." });
  }

  const student = req.student;
  if (!bcrypt.compareSync(currentPassword, student.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (bcrypt.compareSync(newPassword, student.passwordHash)) {
    return res.status(400).json({ error: 'New password must be different from your current password.' });
  }

  db.updateStudentPasswordHash(student.id, bcrypt.hashSync(newPassword, 10));
  db.destroyOtherStudentSessions(student.id, req.sessionID);
  res.json({ ok: true });
});

module.exports = router;
