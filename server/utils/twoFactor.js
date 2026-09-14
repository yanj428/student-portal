const crypto = require('crypto');

// Recovery codes exist so losing an authenticator device doesn't mean
// permanently losing access to that admin account — for the sole owner,
// that would mean losing the ability to manage admin accounts at all,
// with no way back in short of editing the database directly.

const RECOVERY_CODE_COUNT = 8;

function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

// Recovery codes are single-use and high-entropy (40 bits) already, so a
// fast hash is fine here — the protection against guessing comes from the
// code space and the login rate limiter, not from hashing cost the way it
// does for user-chosen passwords.
function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

module.exports = { generateRecoveryCodes, hashRecoveryCode };
