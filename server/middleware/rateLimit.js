const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// These sit on top of the timed account lockout (server/db.js), not instead
// of it: the lockout protects one account/email, this protects the server
// from one IP address hammering many different emails or the shared admin
// password. Overridable via env so tests don't have to send hundreds of
// requests to prove the limiter works.
// skipSuccessfulRequests means only failed attempts count toward the
// limit — this is what a login rate limit should actually be protecting
// against (repeated wrong guesses), rather than penalizing a shared school
// IP where many students legitimately succeed in the same 15 minutes.
const studentLoginLimiter = rateLimit({
  windowMs: (parseFloat(process.env.STUDENT_LOGIN_RATE_WINDOW_MINUTES) || 15) * 60 * 1000,
  limit: parseInt(process.env.STUDENT_LOGIN_RATE_LIMIT, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts from this device. Please try again later.' },
});

const adminLoginLimiter = rateLimit({
  windowMs: (parseFloat(process.env.ADMIN_LOGIN_RATE_WINDOW_MINUTES) || 15) * 60 * 1000,
  limit: parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT, 10) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many admin login attempts from this device. Please try again later.' },
});

const passwordChangeLimiter = rateLimit({
  windowMs: (parseFloat(process.env.PASSWORD_CHANGE_RATE_WINDOW_MINUTES) || 60) * 60 * 1000,
  limit: parseInt(process.env.PASSWORD_CHANGE_RATE_LIMIT, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password change attempts. Please try again later.' },
});

// Keyed by student id (not IP) since the concern here is spam from one
// account, not one network address — a school's shared wifi/NAT would
// otherwise throttle every student behind it together.
const voicePostLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: parseInt(process.env.VOICE_POST_RATE_LIMIT, 10) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session.studentId || ipKeyGenerator(req.ip),
  message: { error: 'Too many posts submitted. Please try again later.' },
});

const voiceReplyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: parseInt(process.env.VOICE_REPLY_RATE_LIMIT, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session.studentId || ipKeyGenerator(req.ip),
  message: { error: 'Too many replies submitted. Please try again later.' },
});

module.exports = {
  studentLoginLimiter,
  adminLoginLimiter,
  passwordChangeLimiter,
  voicePostLimiter,
  voiceReplyLimiter,
};
