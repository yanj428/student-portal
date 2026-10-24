const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// These sit on top of the timed account lockout (server/db.js), not instead
// of it: the lockout protects one account/email, this protects the server
// from one IP address hammering many different emails or the shared admin
// password. Overridable via env so tests don't have to send hundreds of
// requests to prove the limiter works.
function makeLimiter({ windowEnv, defaultWindowMinutes, limitEnv, defaultLimit, message, ...options }) {
  return rateLimit({
    windowMs: (parseFloat(windowEnv && process.env[windowEnv]) || defaultWindowMinutes) * 60 * 1000,
    limit: parseInt(process.env[limitEnv], 10) || defaultLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    ...options,
  });
}

// skipSuccessfulRequests means only failed attempts count toward the limit -
// this is what a login rate limit should actually be protecting against
// (repeated wrong guesses), rather than penalizing a shared school IP where
// many students legitimately succeed in the same 15 minutes.
const studentLoginLimiter = makeLimiter({
  windowEnv: 'STUDENT_LOGIN_RATE_WINDOW_MINUTES',
  defaultWindowMinutes: 15,
  limitEnv: 'STUDENT_LOGIN_RATE_LIMIT',
  defaultLimit: 30,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts from this device. Please try again later.',
});

const adminLoginLimiter = makeLimiter({
  windowEnv: 'ADMIN_LOGIN_RATE_WINDOW_MINUTES',
  defaultWindowMinutes: 15,
  limitEnv: 'ADMIN_LOGIN_RATE_LIMIT',
  defaultLimit: 5,
  skipSuccessfulRequests: true,
  message: 'Too many admin login attempts from this device. Please try again later.',
});

// The limiters below run after authentication and are keyed by account (not
// IP): the concern is spam from one account, and a school's shared wifi/NAT
// would otherwise throttle every student or admin behind it together.
const accountKey = (req) => req.session.studentId || req.session.adminId || ipKeyGenerator(req.ip);

const passwordChangeLimiter = makeLimiter({
  windowEnv: 'PASSWORD_CHANGE_RATE_WINDOW_MINUTES',
  defaultWindowMinutes: 60,
  limitEnv: 'PASSWORD_CHANGE_RATE_LIMIT',
  defaultLimit: 10,
  keyGenerator: accountKey,
  message: 'Too many password change attempts. Please try again later.',
});

const voicePostLimiter = makeLimiter({
  defaultWindowMinutes: 60,
  limitEnv: 'VOICE_POST_RATE_LIMIT',
  defaultLimit: 5,
  keyGenerator: accountKey,
  message: 'Too many posts submitted. Please try again later.',
});

// Keeps one admin session from burning through the Gemini free-tier quota.
const calendarAiLimiter = makeLimiter({
  defaultWindowMinutes: 60,
  limitEnv: 'CALENDAR_AI_RATE_LIMIT',
  defaultLimit: 20,
  keyGenerator: accountKey,
  message: 'Too many AI extraction requests. Please try again later.',
});

module.exports = {
  studentLoginLimiter,
  adminLoginLimiter,
  passwordChangeLimiter,
  voicePostLimiter,
  calendarAiLimiter,
};
