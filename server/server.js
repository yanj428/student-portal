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
// Only public/ is served over HTTP. Everything sensitive — data/ (password
// hashes, student PII), server/, .env, package.json, node_modules/ — lives
// outside it and is never reachable through the static handler, so no
// blocklist is needed here.
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`KPIS student portal running at http://localhost:${PORT}`);
});
