const db = require('../db');
const { publicStudent, sessionExpiredByAbsoluteLimit } = require('./auth');
const { STUDENT_SESSION_ABSOLUTE_MINUTES } = require('../config');

// Gates a rendered student page: redirects to the login page if there's no
// session, or to the change-password page if the account still needs one —
// all before any HTML is sent, so there's no flash of page content to hide
// with client-side JS the way a purely static page would need.
function requireStudentPage(req, res, next) {
  const studentId = req.session.studentId;
  if (!studentId) return res.redirect('/login.html');

  if (sessionExpiredByAbsoluteLimit(req.session, STUDENT_SESSION_ABSOLUTE_MINUTES)) {
    return req.session.destroy(() => {
      res.clearCookie('kpis.sid');
      res.redirect('/login.html');
    });
  }

  const student = db.findById(studentId);
  if (!student) return res.redirect('/login.html');

  const pub = publicStudent(student);
  if (pub.mustChangePassword) return res.redirect('/change-password.html');

  res.locals.student = pub;
  next();
}

module.exports = { requireStudentPage };
