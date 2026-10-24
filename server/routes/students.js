const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const db = require('../db');
const { requireAdmin, isValidSchoolEmail, publicStudent } = require('../middleware/auth');
const { DEFAULT_STUDENT_PASSWORD, SCHOOL_DOMAIN } = require('../config');

const router = express.Router();

const NAME_MAX = 60;
const GRADE_MAX = 20;

router.get('/api/admin/students', requireAdmin, (req, res) => {
  res.json({ students: db.readStudents().map(publicStudent) });
});

// Shared by create and edit. Middle name and nickname are optional; everything
// else is required. Returns { fields } or { error }.
function readStudentFields(body) {
  const { firstName, middleName = '', lastName, nickname = '', email, grade } = body || {};

  if (![firstName, lastName, email, grade].every((v) => typeof v === 'string' && v.trim())) {
    return { error: 'First name, last name, email and grade are required.' };
  }
  if (typeof middleName !== 'string') return { error: 'Middle name must be text.' };
  if (typeof nickname !== 'string') return { error: 'Nickname must be text.' };
  if (/[()]/.test(nickname)) return { error: 'Nickname cannot contain parentheses: they are added automatically.' };
  if ([firstName, middleName, lastName, nickname].some((v) => v.trim().length > NAME_MAX) || grade.trim().length > GRADE_MAX) {
    return { error: `Names must be ${NAME_MAX} characters or fewer and grade ${GRADE_MAX} or fewer.` };
  }
  if (!isValidSchoolEmail(email) || email.trim().length <= SCHOOL_DOMAIN.length) {
    return { error: `Email must end with ${SCHOOL_DOMAIN}.` };
  }
  return {
    fields: {
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      nickname: nickname.trim(),
      email: email.trim().toLowerCase(),
      grade: grade.trim(),
    },
  };
}

router.post('/api/admin/students', requireAdmin, (req, res) => {
  const { fields, error } = readStudentFields(req.body);
  if (error) return res.status(400).json({ error });
  if (db.findByEmail(fields.email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const student = {
    id: crypto.randomUUID(),
    ...fields,
    passwordHash: bcrypt.hashSync(DEFAULT_STUDENT_PASSWORD, 10),
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  };
  db.addStudent(student);
  db.logAuditEvent(req.session.adminUsername, 'student.create', { email: student.email });
  res.status(201).json({ student: publicStudent(student), password: DEFAULT_STUDENT_PASSWORD });
});

// Edits an account's details (not its password: use reset-password for that).
// A student stays logged in through an edit, since sessions follow the account id.
router.put('/api/admin/students/:id', requireAdmin, (req, res) => {
  const existing = db.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Student not found.' });

  const { fields, error } = readStudentFields(req.body);
  if (error) return res.status(400).json({ error });
  const sameEmailOwner = db.findByEmail(fields.email);
  if (sameEmailOwner && sameEmailOwner.id !== existing.id) {
    return res.status(409).json({ error: 'Another account already uses this email.' });
  }

  const updated = db.updateStudent(existing.id, fields);
  db.logAuditEvent(req.session.adminUsername, 'student.update', { email: updated.email });
  res.json({ student: publicStudent(updated) });
});

router.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const student = db.findById(req.params.id);
  const removed = db.removeStudent(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Student not found.' });
  db.logAuditEvent(req.session.adminUsername, 'student.delete', { email: student && student.email });
  res.json({ ok: true });
});

router.post('/api/admin/students/:id/reset-password', requireAdmin, (req, res) => {
  const passwordHash = bcrypt.hashSync(DEFAULT_STUDENT_PASSWORD, 10);
  const student = db.updateStudentPasswordHash(req.params.id, passwordHash, true);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  db.destroyOtherStudentSessions(student.id);
  db.logAuditEvent(req.session.adminUsername, 'student.reset_password', { email: student.email });
  res.json({ ok: true, password: DEFAULT_STUDENT_PASSWORD });
});

// Manual, permanent lock — separate from the automatic timed lockout in
// db.js, for a staff decision (e.g. a student leaves mid-year) rather than
// too many failed passwords.
router.post('/api/admin/students/:id/lock', requireAdmin, (req, res) => {
  const student = db.findById(req.params.id);
  if (!student || !db.setAdminLocked(req.params.id, true)) return res.status(404).json({ error: 'Student not found.' });
  db.logAuditEvent(req.session.adminUsername, 'student.lock', { email: student.email });
  res.json({ ok: true });
});

router.post('/api/admin/students/:id/unlock', requireAdmin, (req, res) => {
  const student = db.findById(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  db.setAdminLocked(student.id, false);
  db.clearThrottle(student.email);
  db.logAuditEvent(req.session.adminUsername, 'student.unlock', { email: student.email });
  res.json({ ok: true });
});

module.exports = router;
