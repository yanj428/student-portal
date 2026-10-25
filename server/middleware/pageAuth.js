const db = require('../db');
const { publicStudent, sessionExpiredByAbsoluteLimit } = require('./auth');
const { STUDENT_SESSION_ABSOLUTE_MINUTES } = require('../config');
const { endRole } = require('../utils/sessionRoles');

// Gates a rendered student page: redirects to the login page if there's no
// session, or to the change-password page if the account still needs one —
// all before any HTML is sent, so there's no flash of page content to hide
// with client-side JS the way a purely static page would need.
function requireStudentPage(req, res, next) {
  const studentId = req.session.studentId;
  if (!studentId) return res.redirect('/login');

  if (sessionExpiredByAbsoluteLimit(req.session, STUDENT_SESSION_ABSOLUTE_MINUTES, 'studentLoginAt')) {
    return endRole(req, res, 'student', () => res.redirect('/login'));
  }

  const student = db.findById(studentId);
  const pub = student && publicStudent(student);
  if (!student || pub.locked) {
    return endRole(req, res, 'student', () => res.redirect('/login'));
  }
  if (pub.mustChangePassword) return res.redirect('/change-password');

  res.locals.student = pub;
  next();
}

module.exports = { requireStudentPage };
