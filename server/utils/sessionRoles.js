const { SESSION_COOKIE_NAME } = require('../config');

// One browser has one session cookie, but it can hold an admin sign-in and a
// student sign-in side by side. Signing in or out as one must leave the other
// alone - otherwise checking the student site in the same browser would end
// the admin's login and send them back to the login screen.
const ROLE_KEYS = {
  admin: ['isAdmin', 'adminId', 'adminUsername', 'adminLoginAt'],
  student: ['studentId', 'studentLoginAt'],
};

const otherRole = (role) => (role === 'admin' ? 'student' : 'admin');
const isSignedIn = (session, role) => (role === 'admin' ? !!session.isAdmin : !!session.studentId);

// The other role's sign-in, to put back after the session is regenerated at
// login (regenerating protects against session fixation but starts empty).
function snapshotRole(session, role) {
  const snapshot = {};
  ROLE_KEYS[role].forEach((key) => {
    if (session[key] !== undefined) snapshot[key] = session[key];
  });
  return snapshot;
}

// Signs out just this role. The whole session (and cookie) only goes once
// nobody is signed in on it any more.
function endRole(req, res, role, done) {
  ROLE_KEYS[role].forEach((key) => delete req.session[key]);
  if (isSignedIn(req.session, otherRole(role))) return req.session.save(() => done());
  return req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME);
    done();
  });
}

function logoutRole(role) {
  return (req, res) => endRole(req, res, role, () => res.json({ ok: true }));
}

module.exports = { snapshotRole, endRole, logoutRole };
