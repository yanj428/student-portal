const express = require('express');
const crypto = require('crypto');
const { ADMIN_PASSWORD } = require('../config');
const { adminLoginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Constant-time comparison so a wrong-length or partially-correct guess
// can't be distinguished from any other wrong guess by response timing.
function passwordsMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufB, bufB); // keep timing consistent either way
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

router.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !passwordsMatch(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    req.session.isAdmin = true;
    res.json({ ok: true });
  });
});

router.post('/api/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

router.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

module.exports = router;
