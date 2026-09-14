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
  return dataDir;
}

module.exports = { initTestEnv };
