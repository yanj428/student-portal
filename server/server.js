const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const { PORT, SESSION_SECRET, SESSION_COOKIE_SECURE, SESSION_COOKIE_NAME, TRUST_PROXY } = require('./config');
const { UPLOADS_DIR } = require('./uploads');
const db = require('./db');
const { cleanUrls } = require('./middleware/cleanUrls');
const SqliteSessionStore = require('./sessionStore');
const { csrfProtection } = require('./middleware/csrf');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');

// Needed when the app sits behind a reverse proxy or tunnel (TRUST_PROXY=1
// in .env) so req.ip/req.secure reflect the real client instead of the
// proxy. A numeric-looking value (including "1") must be passed to Express
// as an actual Number — Express treats a trust-proxy STRING like "1" as a
// literal IP/subnet to trust, not "trust 1 hop", which would silently trust
// no proxy at all and leave every visitor's rate limit/IP log keyed by the
// proxy's own address instead of the real client.
if (TRUST_PROXY) {
  const numericHops = Number(TRUST_PROXY);
  const trustProxyValue = Number.isInteger(numericHops) ? numericHops : TRUST_PROXY === 'true' ? 1 : TRUST_PROXY;
  app.set('trust proxy', trustProxyValue);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        // Matches the hosts content.js and slideArchive.js accept for a Canva link.
        frameSrc: ['https://canva.com', 'https://*.canva.com', 'https://canva.link', 'https://*.canva.link'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        // Only meaningful (and only safe to send) once the site is actually
        // served over HTTPS — forcing it on for local http:// dev would have
        // the browser try to upgrade same-origin requests to https and fail.
        upgradeInsecureRequests: SESSION_COOKIE_SECURE ? [] : null,
      },
    },
    // Same reasoning as the cookie's `secure` flag: only send Strict-
    // Transport-Security once we're really on HTTPS in production.
    hsts: SESSION_COOKIE_SECURE,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(csrfProtection);
app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // resets the idle timeout (cookie.maxAge) on every request
    store: new SqliteSessionStore(db.rawConnection),
    cookie: { httpOnly: true, sameSite: 'lax', secure: SESSION_COOKIE_SECURE, maxAge: 1000 * 60 * 60 * 8 },
  })
);

// Data answers are never kept by the browser, so a change an admin just saved
// (a slide, a club, an order) can't be hidden behind an old copy.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(require('./routes/adminAuth'));
app.use(require('./routes/admins'));
app.use(require('./routes/students'));
app.use(require('./routes/content'));
app.use(require('./routes/lunch'));
app.use(require('./routes/calendarImage'));
app.use(require('./routes/slideArchive'));
app.use(require('./routes/clubs'));
app.use(require('./routes/csEvents'));
app.use(require('./routes/calendarEvents'));
app.use(require('./routes/council'));
app.use(require('./routes/quickLinks'));
app.use(require('./routes/voice'));
app.use(require('./routes/studentAuth'));
app.use(require('./routes/security'));

// Rendered student pages (server-side login/password-change gating) take
// priority over the static handler below, which now only serves assets:
// css, client-side js, images, and the standalone login/admin/change-password
// pages that aren't part of the shared sidebar layout.
app.use(cleanUrls);
app.use(require('./routes/pages'));

// ---- Static site ----
// Only public/ is served over HTTP. Everything sensitive — data/ (password
// hashes, student PII), server/, .env, package.json, node_modules/ — lives
// outside it and is never reachable through the static handler, so no
// blocklist is needed here.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// public/admin/ is also a folder (the admin panel's scripts), so the static
// handler would redirect /admin to /admin/ - which the clean-URL rule sends
// straight back, looping forever. The admin page is served explicitly instead.
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// Anything nothing above answered. Pages get a proper "page not found" screen
// with a way back; API calls and non-page requests keep a short JSON reply.
app.use((req, res) => {
  const isPageRequest = (req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api/');
  if (!isPageRequest) return res.status(404).json({ error: 'Not found.' });
  return res.status(404).sendFile(path.join(PUBLIC_DIR, 'not-found.html'));
});

// Catches everything above, including body-parser's SyntaxError on
// malformed JSON — without this, Express's default handler sends back a
// full stack trace with file paths (visible during earlier manual testing).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // body-parser's JSON SyntaxError carries the raw request body as an own
  // property (err.body) specifically so callers can log it — but our
  // requests can contain plaintext passwords, so logging the error object
  // as-is would write them to the server console/log file. Log only the
  // message and stack, never the error object itself.
  console.error(err && err.stack ? err.stack : String(err));
  res.status(err.status || 500).json({ error: 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`KPIS student portal running at http://localhost:${PORT}`);
  });
}

module.exports = app;
