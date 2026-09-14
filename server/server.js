const path = require('path');
const express = require('express');
const session = require('express-session');

const { PORT, SESSION_SECRET } = require('./config');
const { UPLOADS_DIR } = require('./uploads');

const app = express();
app.use(express.json());
app.use(
  session({
    name: 'kpis.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use(require('./routes/adminAuth'));
app.use(require('./routes/students'));
app.use(require('./routes/content'));
app.use(require('./routes/lunch'));
app.use(require('./routes/slideArchive'));
app.use(require('./routes/csClubs'));
app.use(require('./routes/csEvents'));
app.use(require('./routes/voice'));
app.use(require('./routes/studentAuth'));

// ---- Static site ----
// The project root doubles as the web root (all the .html/.css/.js files live there),
// but that root also holds data/ (password hashes, student PII), server/, and config
// files that must never be servable over HTTP. Block those paths before the static
// handler rather than trying to serve only an allowlist, since that would be a much
// bigger restructure of an otherwise-flat project layout.
const BLOCKED_STATIC_PREFIXES = ['/data', '/server', '/node_modules', '/.git'];
const BLOCKED_STATIC_FILES = new Set([
  '/.env',
  '/.env.example',
  '/.gitignore',
  '/package.json',
  '/package-lock.json',
]);
app.use((req, res, next) => {
  const p = req.path;
  if (BLOCKED_STATIC_FILES.has(p) || BLOCKED_STATIC_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'))) {
    return res.status(404).end();
  }
  next();
});

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '..'), { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`KPIS student portal running at http://localhost:${PORT}`);
});
