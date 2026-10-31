require('dotenv').config();

const bcrypt = require('bcryptjs');

const SCHOOL_DOMAIN = '@kpis.ac.th';
const PORT = process.env.PORT || 8791;
const INSECURE_DEFAULT_ADMIN_PASSWORD = 'kpis-admin';
const INSECURE_DEFAULT_SESSION_SECRET = 'dev-only-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || INSECURE_DEFAULT_ADMIN_PASSWORD;
// The first admin account's password. db.js creates that account from it and
// re-syncs it on every start, so changing this in .env (and restarting) is the
// only way to change that password. Admins an owner adds later keep the
// password they were created with. Production refuses to start without a real
// value below.
const ADMIN_BOOTSTRAP_USERNAME = process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || INSECURE_DEFAULT_SESSION_SECRET;
const DEFAULT_STUDENT_PASSWORD = 'keerapat';
// The temporary password teacher accounts start with. Teachers use the same kind
// of account as students and must also choose their own at the first sign-in.
const DEFAULT_TEACHER_PASSWORD = 'kpisteacher';
const SESSION_COOKIE_NAME = 'kpis.sid';
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
const ADMIN_SESSION_IDLE_MINUTES = parseFloat(process.env.ADMIN_SESSION_IDLE_MINUTES) || 1440; // 24 hours
const ADMIN_SESSION_ABSOLUTE_MINUTES = parseFloat(process.env.ADMIN_SESSION_ABSOLUTE_MINUTES) || 43200; // 30 days

// Only sent over HTTPS once the site is actually served that way. Force it
// on by setting NODE_ENV=production (also see TRUST_PROXY below, needed
// when a reverse proxy/tunnel sits in front of the app).
const SESSION_COOKIE_SECURE = process.env.NODE_ENV === 'production';
// The string "false" or "0" means off, not a literal address to trust.
const TRUST_PROXY = ['', 'false', '0'].includes(process.env.TRUST_PROXY || '') ? false : process.env.TRUST_PROXY;

// Powers the optional "Extract events with AI" feature on the School
// Calendar admin page (server/utils/calendarEventsAi.js). Left unset, that
// feature just returns a clear "not configured" error instead of the app
// failing to start - it's an enhancement, not something the rest of the
// site depends on.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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
  // well-known default (it is written in this file) would make
  // every protection built on top of them pointless. Failing fast here
  // beats discovering it after something goes wrong.
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === INSECURE_DEFAULT_ADMIN_PASSWORD) {
    throw new Error('Refusing to start in production with no real ADMIN_PASSWORD set in .env.');
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === INSECURE_DEFAULT_SESSION_SECRET) {
    throw new Error('Refusing to start in production with no real SESSION_SECRET set in .env.');
  }
  // Not fatal (a production run with no proxy in front of it is a real,
  // valid setup) — but this is the single most common way to end up with
  // every visitor sharing one rate-limit bucket (see server/middleware/
  // rateLimit.js) behind a reverse proxy or tunnel, so it's worth flagging
  // loudly rather than only discovering it once a login lockout hits
  // everyone at once.
  if (!TRUST_PROXY) {
    console.warn(
      '[warn] Running in production without TRUST_PROXY set. If this site is behind a reverse proxy or tunnel, every visitor will look like the same IP address to the rate limiter — set TRUST_PROXY (see .env.example).'
    );
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
  ADMIN_BOOTSTRAP_USERNAME,
  SESSION_SECRET,
  DEFAULT_STUDENT_PASSWORD,
  DEFAULT_TEACHER_PASSWORD,
  ACCOUNT_LOCKED_MESSAGE,
  SESSION_COOKIE_NAME,
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
  GEMINI_API_KEY,
};
