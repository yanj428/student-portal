const bcrypt = require('bcryptjs');
const { DEFAULT_STUDENT_PASSWORD, SCHOOL_DOMAIN } = require('../config');

function isValidSchoolEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(SCHOOL_DOMAIN);
}

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Admin login required.' });
}

function requireStudent(req, res, next) {
  if (req.session.studentId) return next();
  return res.status(401).json({ error: 'Not logged in.' });
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
    locked: !!student.locked,
  };
}

module.exports = { isValidSchoolEmail, requireAdmin, requireStudent, publicStudent };
