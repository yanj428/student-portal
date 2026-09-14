const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const { PORT, SESSION_SECRET, SESSION_COOKIE_SECURE, TRUST_PROXY } = require('./config');
const { UPLOADS_DIR } = require('./uploads');
const db = require('./db');
const SqliteSessionStore = require('./sessionStore');
const { csrfProtection } = require('./middleware/csrf');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');

// Needed when the app sits behind a reverse proxy or tunnel (TRUST_PROXY=1
// in .env) so req.ip/req.secure reflect the real client instead of the proxy.
if (TRUST_PROXY) app.set('trust proxy', TRUST_PROXY === 'true' ? 1 : TRUST_PROXY);

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
        frameSrc: ['https://www.canva.com', 'https://canva.com'],
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
    name: 'kpis.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // resets the idle timeout (cookie.maxAge) on every request
    store: new SqliteSessionStore(db.rawConnection),
    cookie: { httpOnly: true, sameSite: 'lax', secure: SESSION_COOKIE_SECURE, maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use(require('./routes/adminAuth'));
app.use(require('./routes/admins'));
app.use(require('./routes/students'));
app.use(require('./routes/content'));
app.use(require('./routes/lunch'));
app.use(require('./routes/slideArchive'));
app.use(require('./routes/clubs'));
app.use(require('./routes/csEvents'));
app.use(require('./routes/announcements'));
app.use(require('./routes/calendarEvents'));
app.use(require('./routes/council'));
app.use(require('./routes/projects'));
app.use(require('./routes/quickLinks'));
app.use(require('./routes/voice'));
app.use(require('./routes/studentAuth'));
app.use(require('./routes/security'));

// Rendered student pages (server-side login/password-change gating) take
// priority over the static handler below, which now only serves assets:
// css, client-side js, images, and the standalone login/admin/change-password
// pages that aren't part of the shared sidebar layout.
app.use(require('./routes/pages'));

// ---- Static site ----
// Only public/ is served over HTTP. Everything sensitive — data/ (password
// hashes, student PII), server/, .env, package.json, node_modules/ — lives
// outside it and is never reachable through the static handler, so no
// blocklist is needed here.
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// Catches everything above, including body-parser's SyntaxError on
// malformed JSON — without this, Express's default handler sends back a
// full stack trace with file paths (visible during earlier manual testing).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(err.status || 500).json({ error: 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`KPIS student portal running at http://localhost:${PORT}`);
  });
}

module.exports = app;
