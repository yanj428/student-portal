const path = require('path');
const express = require('express');
const session = require('express-session');

const { PORT, SESSION_SECRET } = require('./config');
const { UPLOADS_DIR } = require('./uploads');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

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
app.use(require('./routes/clubs'));
app.use(require('./routes/csEvents'));
app.use(require('./routes/announcements'));
app.use(require('./routes/calendarEvents'));
app.use(require('./routes/council'));
app.use(require('./routes/projects'));
app.use(require('./routes/quickLinks'));
app.use(require('./routes/voice'));
app.use(require('./routes/studentAuth'));

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

app.listen(PORT, () => {
  console.log(`KPIS student portal running at http://localhost:${PORT}`);
});
