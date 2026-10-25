const db = require('../db');
const { ACCOUNT_LOCKED_MESSAGE } = require('../config');

function minutesUntil(isoTimestamp) {
  return Math.max(1, Math.ceil((new Date(isoTimestamp).getTime() - Date.now()) / 60000));
}

// The same 403 body for a timed lockout and a manual lock, shared by the
// student and admin login routes. `key` is the throttle key the attempt is
// logged under (an email, or "admin:<username>").
function lockedResponse(res, key, ip, lockedUntil) {
  db.recordLoginAttempt({ email: key, ip, success: false, reason: 'locked' });
  const retryAfterMinutes = lockedUntil ? minutesUntil(lockedUntil) : null;
  return res.status(403).json({
    error: retryAfterMinutes
      ? `${ACCOUNT_LOCKED_MESSAGE} You can try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`
      : ACCOUNT_LOCKED_MESSAGE,
    locked: true,
    retryAfterMinutes,
  });
}

module.exports = { lockedResponse };
