const db = require('../db');
const { endRole } = require('../utils/sessionRoles');
const { fullName } = require('../utils/studentName');
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
// `loginAtField` is the role's own sign-in time (adminLoginAt / studentLoginAt);
// sessions started before those existed only have the shared `loginAt`.
function sessionExpiredByAbsoluteLimit(session, absoluteMinutes, loginAtField = 'loginAt') {
  const loginAt = session[loginAtField] || session.loginAt;
  return !!(loginAt && Date.now() - loginAt > absoluteMinutes * 60 * 1000);
}

// Ends only that role's sign-in, so an expired student session can't take an
// admin login on the same browser down with it.
function expireSession(req, res, message, role) {
  endRole(req, res, role, () => res.status(401).json({ error: message }));
}

// Re-checks the account against the database on every request, not just at
// login — a locked or deleted account's existing session stops working
// immediately instead of staying valid until the cookie's own idle/absolute
// timeout eventually catches up. Attaches the fresh row as req.student so
// route handlers reuse this lookup instead of re-fetching it themselves.
function requireStudent(req, res, next) {
  if (!req.session.studentId) return res.status(401).json({ error: 'Not logged in.' });
  if (sessionExpiredByAbsoluteLimit(req.session, STUDENT_SESSION_ABSOLUTE_MINUTES, 'studentLoginAt')) {
    return expireSession(req, res, 'Your session has expired. Please log in again.', 'student');
  }

  const student = db.findById(req.session.studentId);
  if (!student) return expireSession(req, res, 'This account no longer exists.', 'student');
  if (db.getLockStatus(student.email).locked) {
    return expireSession(req, res, 'This account has been locked. Please contact the Student Council.', 'student');
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
    if (req.student.mustChangePassword) {
      return res.status(403).json({ error: 'Please change your password before continuing.' });
    }
    next();
  });
}

// Same re-check for admins: a deleted admin's existing session loses access
// immediately rather than keeping full admin rights until it times out.
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Admin login required.' });
  if (sessionExpiredByAbsoluteLimit(req.session, ADMIN_SESSION_ABSOLUTE_MINUTES, 'adminLoginAt')) {
    return expireSession(req, res, 'Your admin session has expired. Please log in again.', 'admin');
  }

  const admin = db.findAdminById(req.session.adminId);
  if (!admin) return expireSession(req, res, 'This admin account no longer exists.', 'admin');

  // An admin who signed in with a temporary password may do nothing but choose
  // a new one (that route sets req.allowMustChangePassword) until they have.
  if (admin.mustChangePassword && !req.allowMustChangePassword) {
    return res.status(403).json({ error: 'Choose a new password first.', mustChangePassword: true });
  }

  req.admin = admin;
  return next();
}

// requireAdmin, plus refuses access unless the admin's role is 'owner' —
// used for admin-account management and the Security tab, which an
// 'editor' admin (who otherwise has full access to student/content data)
// doesn't get: those affect who has access to the portal at all, not the
// portal's content.
function requireOwnerAdmin(req, res, next) {
  requireAdmin(req, res, (err) => {
    if (err) return next(err);
    if (req.admin.role !== 'owner') {
      return res.status(403).json({ error: 'Only an owner admin can do this.' });
    }
    next();
  });
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
    middleName: student.middleName || '',
    nickname: student.nickname || '',
    fullName: fullName(student),
    email: student.email,
    grade: student.grade,
    // Grades are stored as typed ("Grade 12" from the admin form, or just "12"),
    // so the word is only added when it's missing.
    gradeLabel: /^grade( |$)/i.test(student.grade) ? student.grade : `Grade ${student.grade}`,
    createdAt: student.createdAt,
    mustChangePassword: !!student.mustChangePassword,
    locked: db.getLockStatus(student.email).locked,
  };
}

module.exports = {
  isValidSchoolEmail,
  requireAdmin,
  requireOwnerAdmin,
  requireStudent,
  requireActiveStudent,
  publicStudent,
  sessionExpiredByAbsoluteLimit,
};
