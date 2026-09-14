require('dotenv').config();

const bcrypt = require('bcryptjs');

const SCHOOL_DOMAIN = '@kpis.ac.th';
const PORT = process.env.PORT || 8791;
const INSECURE_DEFAULT_ADMIN_PASSWORD = 'kpis-admin';
const INSECURE_DEFAULT_SESSION_SECRET = 'dev-only-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || INSECURE_DEFAULT_ADMIN_PASSWORD;
// Only used once, to create the first admin account (see db.js's
// ensureAdminsBootstrap) the first time the app runs against a database
// with no admins table yet. After that, admin accounts and their own
// hashed passwords live in the database, and ADMIN_PASSWORD is unused.
const ADMIN_BOOTSTRAP_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@kpis.ac.th';
const SESSION_SECRET = process.env.SESSION_SECRET || INSECURE_DEFAULT_SESSION_SECRET;
const DEFAULT_STUDENT_PASSWORD = 'keerapat';
const ACCOUNT_LOCKED_MESSAGE =
  'This account has been locked after too many failed login attempts. Please contact the Student Council to regain access.';

// Timed lockout, modeled on how PowerSchool handles this: a short lock that
// gets longer each time it happens again, instead of a permanent lock an
// attacker can trigger on purpose against any account they can guess the
// email for. Overridable via env so tests don't have to wait real minutes.
const LOGIN_LOCKOUT_THRESHOLD = parseInt(process.env.LOGIN_LOCKOUT_THRESHOLD, 10) || 5;
const LOGIN_LOCKOUT_WINDOW_MINUTES = parseFloat(process.env.LOGIN_LOCKOUT_WINDOW_MINUTES) || 15;
const LOGIN_LOCKOUT_BASE_MINUTES = parseFloat(process.env.LOGIN_LOCKOUT_BASE_MINUTES) || 15;
const LOGIN_LOCKOUT_MAX_MINUTES = parseFloat(process.env.LOGIN_LOCKOUT_MAX_MINUTES) || 1440;
const LOGIN_ATTEMPT_LOG_RETENTION_DAYS = parseInt(process.env.LOGIN_ATTEMPT_LOG_RETENTION_DAYS, 10) || 90;

// Session lifetimes. "Idle" resets on every request (session.cookie.maxAge
// with rolling:true); "absolute" is a hard cap tracked separately via
// session.loginAt, since express-session's cookie maxAge alone can't express
// "logged out 8 hours after login no matter what you do in between."
const STUDENT_SESSION_IDLE_MINUTES = parseFloat(process.env.STUDENT_SESSION_IDLE_MINUTES) || 120;
const STUDENT_SESSION_ABSOLUTE_MINUTES = parseFloat(process.env.STUDENT_SESSION_ABSOLUTE_MINUTES) || 480;
const ADMIN_SESSION_IDLE_MINUTES = parseFloat(process.env.ADMIN_SESSION_IDLE_MINUTES) || 60;
const ADMIN_SESSION_ABSOLUTE_MINUTES = parseFloat(process.env.ADMIN_SESSION_ABSOLUTE_MINUTES) || 480;

// Only sent over HTTPS once the site is actually served that way. Force it
// on by setting NODE_ENV=production (also see TRUST_PROXY below, needed
// when a reverse proxy/tunnel sits in front of the app).
const SESSION_COOKIE_SECURE = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY || false;

// A fixed, precomputed hash with no matching password — compared against
// on every login for an email/admin that doesn't exist, so that branch
// costs the same ~50ms of bcrypt work a real account's check would. Without
// this, an unknown account fails almost instantly while a real one takes
// measurably longer, which is enough on its own to tell which emails have
// accounts even though the response bodies are identical.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('no-such-account', 10);

if (process.env.NODE_ENV === 'production') {
  // These two protect, respectively, every admin account and every student
  // session cookie — starting in production with either still on its
  // well-known, public (this is an open-source repo) default would make
  // every protection built on top of them pointless. Failing fast here
  // beats discovering it after something goes wrong.
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === INSECURE_DEFAULT_ADMIN_PASSWORD) {
    throw new Error('Refusing to start in production with no real ADMIN_PASSWORD set in .env.');
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === INSECURE_DEFAULT_SESSION_SECRET) {
    throw new Error('Refusing to start in production with no real SESSION_SECRET set in .env.');
  }
} else {
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('[warn] ADMIN_PASSWORD not set in .env — using the insecure default. Set it before deploying.');
  }
  if (!process.env.SESSION_SECRET) {
    console.warn('[warn] SESSION_SECRET not set in .env — using an insecure default. Set it before deploying.');
  }
}

module.exports = {
  SCHOOL_DOMAIN,
  PORT,
  ADMIN_PASSWORD,
  ADMIN_BOOTSTRAP_EMAIL,
  SESSION_SECRET,
  DEFAULT_STUDENT_PASSWORD,
  ACCOUNT_LOCKED_MESSAGE,
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_WINDOW_MINUTES,
  LOGIN_LOCKOUT_BASE_MINUTES,
  LOGIN_LOCKOUT_MAX_MINUTES,
  LOGIN_ATTEMPT_LOG_RETENTION_DAYS,
  STUDENT_SESSION_IDLE_MINUTES,
  STUDENT_SESSION_ABSOLUTE_MINUTES,
  ADMIN_SESSION_IDLE_MINUTES,
  ADMIN_SESSION_ABSOLUTE_MINUTES,
  SESSION_COOKIE_SECURE,
  TRUST_PROXY,
  DUMMY_PASSWORD_HASH,
};
