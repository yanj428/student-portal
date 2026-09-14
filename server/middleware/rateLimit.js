const rateLimit = require('express-rate-limit');

// These sit on top of the timed account lockout (server/db.js), not instead
// of it: the lockout protects one account/email, this protects the server
// from one IP address hammering many different emails or the shared admin
// password. Overridable via env so tests don't have to send hundreds of
// requests to prove the limiter works.
const studentLoginLimiter = rateLimit({
  windowMs: (parseFloat(process.env.STUDENT_LOGIN_RATE_WINDOW_MINUTES) || 15) * 60 * 1000,
  limit: parseInt(process.env.STUDENT_LOGIN_RATE_LIMIT, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this device. Please try again later.' },
});

const adminLoginLimiter = rateLimit({
  windowMs: (parseFloat(process.env.ADMIN_LOGIN_RATE_WINDOW_MINUTES) || 15) * 60 * 1000,
  limit: parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT, 10) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts from this device. Please try again later.' },
});

const passwordChangeLimiter = rateLimit({
  windowMs: (parseFloat(process.env.PASSWORD_CHANGE_RATE_WINDOW_MINUTES) || 60) * 60 * 1000,
  limit: parseInt(process.env.PASSWORD_CHANGE_RATE_LIMIT, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password change attempts. Please try again later.' },
});

module.exports = { studentLoginLimiter, adminLoginLimiter, passwordChangeLimiter };
