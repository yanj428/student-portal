require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const db = require('./db');

const SCHOOL_DOMAIN = '@kpis.ac.th';
const PORT = process.env.PORT || 8791;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kpis-admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[warn] ADMIN_PASSWORD not set in .env — using the insecure default. Set it before deploying.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET not set in .env — using an insecure default. Set it before deploying.');
}

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

function isValidSchoolEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(SCHOOL_DOMAIN);
}

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Admin login required.' });
}

function requireStudent(req, res, next) {
  if (req.session.studentId) return next();
  return res.status(401).json({ error: 'Not logged in.' });
}

function publicStudent(student) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    grade: student.grade,
    createdAt: student.createdAt,
  };
}

// ---- Admin auth ----
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// ---- Admin: manage student accounts ----
app.get('/api/admin/students', requireAdmin, (req, res) => {
  res.json({ students: db.readStudents().map(publicStudent) });
});

app.post('/api/admin/students', requireAdmin, (req, res) => {
  const { firstName, lastName, email, grade, password } = req.body || {};

  if (!firstName || !lastName || !email || !grade || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!isValidSchoolEmail(email)) {
    return res.status(400).json({ error: `Email must end with ${SCHOOL_DOMAIN}.` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Temporary password must be at least 8 characters.' });
  }
  if (db.findByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const student = {
    id: crypto.randomUUID(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    grade,
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
  };
  db.addStudent(student);
  res.status(201).json({ student: publicStudent(student) });
});

app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const removed = db.removeStudent(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Student not found.' });
  res.json({ ok: true });
});

// ---- Student auth ----
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const student = db.findByEmail(email);
  if (!student || !bcrypt.compareSync(password, student.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  req.session.studentId = student.id;
  res.json({ student: publicStudent(student) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('kpis.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', requireStudent, (req, res) => {
  const student = db.findById(req.session.studentId);
  if (!student) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ student: publicStudent(student) });
});

// ---- Static site ----
app.use(express.static(path.join(__dirname, '..'), { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`KPIS student portal running at http://localhost:${PORT}`);
});
