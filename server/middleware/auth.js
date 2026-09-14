const db = require('../db');
const {
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

// Re-checks the account against the database on every request, not just at
// login — a locked or deleted account's existing session stops working
// immediately instead of staying valid until the cookie's own idle/absolute
// timeout eventually catches up. Attaches the fresh row as req.student so
// route handlers reuse this lookup instead of re-fetching it themselves.
function requireStudent(req, res, next) {
  if (!req.session.studentId) return res.status(401).json({ error: 'Not logged in.' });
  if (sessionExpiredByAbsoluteLimit(req.session, STUDENT_SESSION_ABSOLUTE_MINUTES)) {
    return expireSession(req, res, 'Your session has expired. Please log in again.');
  }

  const student = db.findById(req.session.studentId);
  if (!student) return expireSession(req, res, 'This account no longer exists.');
  if (db.getLockStatus(student.email).locked) {
    return expireSession(req, res, 'This account has been locked. Please contact the Student Council.');
  }

  req.student = student;
  return next();
}

// requireStudent, plus refuses access while the account still needs a
// password change — used by every student-facing content route. Not used
// by /api/me or /api/change-password themselves, which must keep working
// for an account in that state so it has a way to fix it.
function requireActiveStudent(req, res, next) {
  requireStudent(req, res, (err) => {
    if (err) return next(err);
    if (publicStudent(req.student).mustChangePassword) {
      return res.status(403).json({ error: 'Please change your password before continuing.' });
    }
    next();
  });
}

// Same re-check for admins: a deleted admin's existing session loses access
// immediately rather than keeping full admin rights until it times out.
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Admin login required.' });
  if (sessionExpiredByAbsoluteLimit(req.session, ADMIN_SESSION_ABSOLUTE_MINUTES)) {
    return expireSession(req, res, 'Your admin session has expired. Please log in again.');
  }

  const admin = db.findAdminById(req.session.adminId);
  if (!admin) return expireSession(req, res, 'This admin account no longer exists.');

  req.admin = admin;
  return next();
}

// A student's `mustChangePassword` is a plain stored flag (set true on
// account creation and admin reset, false on a successful self-service
// change) rather than recomputed by hashing the default password against
// the stored hash on every call — that used to cost a full bcrypt
// comparison (~50ms) on every page load and every admin student-list
// fetch. The stored flag is reliable because /api/change-password refuses
// to ever set the password back to the default in the first place.
function publicStudent(student) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    grade: student.grade,
    createdAt: student.createdAt,
    mustChangePassword: !!student.mustChangePassword,
    locked: db.getLockStatus(student.email).locked,
  };
}

module.exports = {
  isValidSchoolEmail,
  requireAdmin,
  requireStudent,
  requireActiveStudent,
  publicStudent,
  sessionExpiredByAbsoluteLimit,
};
