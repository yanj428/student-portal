const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Blocks cross-site requests to state-changing endpoints. Real browsers
// attach an Origin header to fetch()/XHR requests (including same-origin
// ones), so a request whose Origin doesn't match our own host is either a
// cross-site page trying to act on a logged-in user's session, or a tool
// that doesn't send Origin at all (curl, the test suite) — the latter is
// let through since it carries no ambient browser credentials to steal in
// the first place.
function csrfProtection(req, res, next) {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }

  if (originHost !== req.get('host')) {
    return res.status(403).json({ error: 'Cross-site request blocked.' });
  }

  next();
}

module.exports = { csrfProtection };
