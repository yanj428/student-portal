const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { requireStudent, publicStudent } = require('../middleware/auth');
const { DEFAULT_STUDENT_PASSWORD, ACCOUNT_LOCKED_MESSAGE } = require('../config');

const router = express.Router();

router.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const student = db.findByEmail(email);
  if (!student) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  if (student.locked) {
    return res.status(403).json({ error: ACCOUNT_LOCKED_MESSAGE, locked: true });
  }

  if (!bcrypt.compareSync(password, student.passwordHash)) {
    const updated = db.recordFailedLogin(student.id);
    if (updated && updated.locked) {
      return res.status(403).json({ error: ACCOUNT_LOCKED_MESSAGE, locked: true });
    }
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  db.clearFailedLogins(student.id);
  req.session.studentId = student.id;
  res.json({ student: publicStudent(student) });
});

router.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('kpis.sid');
    res.json({ ok: true });
  });
});

router.get('/api/me', requireStudent, (req, res) => {
  const student = db.findById(req.session.studentId);
  if (!student) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ student: publicStudent(student) });
});

router.post('/api/change-password', requireStudent, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  if (newPassword === DEFAULT_STUDENT_PASSWORD) {
    return res.status(400).json({ error: "You can't use the default password. Please choose a different password." });
  }

  const student = db.findById(req.session.studentId);
  if (!student) return res.status(401).json({ error: 'Not logged in.' });

  if (!bcrypt.compareSync(currentPassword, student.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (bcrypt.compareSync(newPassword, student.passwordHash)) {
    return res.status(400).json({ error: 'New password must be different from your current password.' });
  }

  db.updateStudentPasswordHash(student.id, bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

module.exports = router;
