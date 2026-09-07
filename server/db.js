const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STUDENTS_FILE)) fs.writeFileSync(STUDENTS_FILE, '[]\n');
}

function readStudents() {
  ensureStore();
  const raw = fs.readFileSync(STUDENTS_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeStudents(students) {
  ensureStore();
  fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2) + '\n');
}

function findByEmail(email) {
  const normalized = email.trim().toLowerCase();
  return readStudents().find((s) => s.email.toLowerCase() === normalized) || null;
}

function findById(id) {
  return readStudents().find((s) => s.id === id) || null;
}

function addStudent(student) {
  const students = readStudents();
  students.push(student);
  writeStudents(students);
  return student;
}

function removeStudent(id) {
  const students = readStudents();
  const next = students.filter((s) => s.id !== id);
  writeStudents(next);
  return next.length !== students.length;
}

module.exports = { readStudents, writeStudents, findByEmail, findById, addStudent, removeStudent };
