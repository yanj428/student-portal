const fs = require('fs');
const os = require('os');
const path = require('path');

// Point the app at a throwaway data directory and known secrets before the
// app modules (which read env/config at require time) are ever required.
// Must be called before requiring '../../server/server' or anything under
// server/ that transitively pulls in config.js or db.js.
function initTestEnv() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpis-test-'));
  process.env.DATA_DIR = dataDir;
  process.env.ADMIN_PASSWORD = 'test-admin-pw';
  process.env.SESSION_SECRET = 'test-session-secret';

  // Fast lockout durations so tests can observe an auto-unlock in
  // milliseconds instead of real minutes. The threshold/window (how many
  // failures, over what span, trigger a lock) stay at their real defaults
  // since tests only need to reach or avoid the threshold, not wait it out.
  process.env.LOGIN_LOCKOUT_BASE_MINUTES = '0.005'; // 300ms
  process.env.LOGIN_LOCKOUT_MAX_MINUTES = '0.01'; // 600ms

  // Rate limits high enough that a test's own request volume never trips
  // them by accident — the rate limiter itself is tested separately with
  // its own low limits.
  process.env.STUDENT_LOGIN_RATE_LIMIT = '1000';
  process.env.ADMIN_LOGIN_RATE_LIMIT = '1000';
  process.env.PASSWORD_CHANGE_RATE_LIMIT = '1000';

  return dataDir;
}

module.exports = { initTestEnv };
