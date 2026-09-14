const bcrypt = require('bcryptjs');
const db = require('../db');
const {
  DEFAULT_STUDENT_PASSWORD,
  SCHOOL_DOMAIN,
  STUDENT_SESSION_ABSOLUTE_MINUTES,
  ADMIN_SESSION_ABSOLUTE_MINUTES,
} = require('../config');

function isValidSchoolEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(SCHOOL_DOMAIN);
}

// The cookie's own maxAge (set at login, see studentAuth.js/adminAuth.js)
// gives an idle timeout — it resets on every request via `rolling: true`.
// This is the separate hard cap that idle activity can't extend: log back
// in after N hours no matter how continuously the session was used.
function sessionExpiredByAbsoluteLimit(session, absoluteMinutes) {
  return !!(session.loginAt && Date.now() - session.loginAt > absoluteMinutes * 60 * 1000);
}

function expireSession(req, res, message) {
  req.session.destroy(() => {
    res.clearCookie('kpis.sid');
    res.status(401).json({ error: message });
  });
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Admin login required.' });
  if (sessionExpiredByAbsoluteLimit(req.session, ADMIN_SESSION_ABSOLUTE_MINUTES)) {
    return expireSession(req, res, 'Your admin session has expired. Please log in again.');
  }
  return next();
}

function requireStudent(req, res, next) {
  if (!req.session.studentId) return res.status(401).json({ error: 'Not logged in.' });
  if (sessionExpiredByAbsoluteLimit(req.session, STUDENT_SESSION_ABSOLUTE_MINUTES)) {
    return expireSession(req, res, 'Your session has expired. Please log in again.');
  }
  return next();
}

// A student's `mustChangePassword` is true if it was explicitly set (new
// account, admin reset) OR if their current password still hashes to the
// default — this catches the case where a student sets their own password
// back to the default, not just the two places we set the flag ourselves.
function publicStudent(student) {
  const stillDefaultPassword = bcrypt.compareSync(DEFAULT_STUDENT_PASSWORD, student.passwordHash);
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    grade: student.grade,
    createdAt: student.createdAt,
    mustChangePassword: !!student.mustChangePassword || stillDefaultPassword,
    locked: db.getLockStatus(student.email).locked,
  };
}

module.exports = { isValidSchoolEmail, requireAdmin, requireStudent, publicStudent, sessionExpiredByAbsoluteLimit };
