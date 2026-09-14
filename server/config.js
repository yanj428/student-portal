require('dotenv').config();

const SCHOOL_DOMAIN = '@kpis.ac.th';
const PORT = process.env.PORT || 8791;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kpis-admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const DEFAULT_STUDENT_PASSWORD = 'keerapat';
const ACCOUNT_LOCKED_MESSAGE =
  'This account has been locked after too many failed login attempts. Please contact the Student Council to regain access.';

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
};
