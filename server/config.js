require('dotenv').config();

const SCHOOL_DOMAIN = '@kpis.ac.th';
const PORT = process.env.PORT || 8791;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kpis-admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
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

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[warn] ADMIN_PASSWORD not set in .env — using the insecure default. Set it before deploying.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET not set in .env — using an insecure default. Set it before deploying.');
}

module.exports = {
  SCHOOL_DOMAIN,
  PORT,
  ADMIN_PASSWORD,
  SESSION_SECRET,
  DEFAULT_STUDENT_PASSWORD,
  ACCOUNT_LOCKED_MESSAGE,
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_WINDOW_MINUTES,
  LOGIN_LOCKOUT_BASE_MINUTES,
  LOGIN_LOCKOUT_MAX_MINUTES,
  LOGIN_ATTEMPT_LOG_RETENTION_DAYS,
};
