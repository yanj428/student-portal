const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { requireAdmin, isValidSchoolEmail, publicStudent } = require('../middleware/auth');
const { DEFAULT_STUDENT_PASSWORD, SCHOOL_DOMAIN } = require('../config');

const router = express.Router();

router.get('/api/admin/students', requireAdmin, (req, res) => {
  res.json({ students: db.readStudents().map(publicStudent) });
});

router.post('/api/admin/students', requireAdmin, (req, res) => {
  const { firstName, lastName, email, grade } = req.body || {};

  if (!firstName || !lastName || !email || !grade) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!isValidSchoolEmail(email)) {
    return res.status(400).json({ error: `Email must end with ${SCHOOL_DOMAIN}.` });
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
    passwordHash: bcrypt.hashSync(DEFAULT_STUDENT_PASSWORD, 10),
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  };
  db.addStudent(student);
  res.status(201).json({ student: publicStudent(student), password: DEFAULT_STUDENT_PASSWORD });
});

router.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const removed = db.removeStudent(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Student not found.' });
  res.json({ ok: true });
});

router.post('/api/admin/students/:id/reset-password', requireAdmin, (req, res) => {
  const passwordHash = bcrypt.hashSync(DEFAULT_STUDENT_PASSWORD, 10);
  const student = db.updateStudentPasswordHash(req.params.id, passwordHash, true);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  db.destroyOtherStudentSessions(student.id);
  res.json({ ok: true, password: DEFAULT_STUDENT_PASSWORD });
});

// Manual, permanent lock — separate from the automatic timed lockout in
// db.js, for a staff decision (e.g. a student leaves mid-year) rather than
// too many failed passwords.
router.post('/api/admin/students/:id/lock', requireAdmin, (req, res) => {
  if (!db.setAdminLocked(req.params.id, true)) return res.status(404).json({ error: 'Student not found.' });
  res.json({ ok: true });
});

router.post('/api/admin/students/:id/unlock', requireAdmin, (req, res) => {
  const student = db.findById(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  db.setAdminLocked(student.id, false);
  db.clearThrottle(student.email);
  res.json({ ok: true });
});

module.exports = router;
