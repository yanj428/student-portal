const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');

// Text shown on the homepage that isn't a manageable collection: the current
// weekly slide, this week's lunch menu (fixed Mon–Fri shape), and the lunch
// schedule image. Everything else that used to live here (announcements,
// calendar events, clubs, council, projects, quick links) is its own
// collection below, each with full admin add/edit/delete.
const DEFAULT_CONTENT = {
  lunchMenu: [
    { weekday: 'Mon', item: '' },
    { weekday: 'Tue', item: '' },
    { weekday: 'Wed', item: '' },
    { weekday: 'Thu', item: '' },
    { weekday: 'Fri', item: '' },
  ],
  weeklySlide: {
    weekLabel: '',
    canvaEmbedUrl: '',
  },
  lunchSchedule: {
    weekLabel: '',
    imageUrl: '',
  },
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STUDENTS_FILE)) fs.writeFileSync(STUDENTS_FILE, '[]\n');
  if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, JSON.stringify(DEFAULT_CONTENT, null, 2) + '\n');
}

// A small JSON-file-backed array collection: every admin-manageable list
// (clubs, announcements, calendar events, council, projects, quick links,
// CS events, slide archive, voice posts) follows the same read-array/
// write-array shape, so it's defined once here instead of once per file.
function jsonCollection(filename) {
  const filePath = path.join(DATA_DIR, filename);
  return {
    read() {
      ensureStore();
      if (!fs.existsSync(filePath)) return [];
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        return [];
      }
    },
    write(items) {
      ensureStore();
      fs.writeFileSync(filePath, JSON.stringify(items, null, 2) + '\n');
    },
  };
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

function updateStudentPasswordHash(id, passwordHash, mustChangePassword = false) {
  const students = readStudents();
  const student = students.find((s) => s.id === id);
  if (!student) return null;
  student.passwordHash = passwordHash;
  student.mustChangePassword = mustChangePassword;
  student.failedLoginAttempts = 0;
  student.locked = false;
  writeStudents(students);
  return student;
}

const MAX_FAILED_LOGIN_ATTEMPTS = 10;

function recordFailedLogin(id) {
  const students = readStudents();
  const student = students.find((s) => s.id === id);
  if (!student) return null;
  student.failedLoginAttempts = (student.failedLoginAttempts || 0) + 1;
  if (student.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    student.locked = true;
  }
  writeStudents(students);
  return student;
}

function clearFailedLogins(id) {
  const students = readStudents();
  const student = students.find((s) => s.id === id);
  if (!student) return null;
  student.failedLoginAttempts = 0;
  writeStudents(students);
  return student;
}

function readContent() {
  ensureStore();
  const raw = fs.readFileSync(CONTENT_FILE, 'utf8');
  let content;
  try {
    content = JSON.parse(raw);
  } catch {
    return DEFAULT_CONTENT;
  }

  for (const key of Object.keys(DEFAULT_CONTENT)) {
    if (!(key in content)) content[key] = DEFAULT_CONTENT[key];
  }

  return content;
}

function writeContent(content) {
  ensureStore();
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2) + '\n');
}

const voicePosts = jsonCollection('voice-posts.json');
const slideArchive = jsonCollection('slide-archive.json');
const clubs = jsonCollection('clubs.json');
const csEvents = jsonCollection('cs-events.json');
const announcements = jsonCollection('announcements.json');
const calendarEvents = jsonCollection('calendar-events.json');
const council = jsonCollection('council.json');
const projects = jsonCollection('projects.json');
const quickLinks = jsonCollection('quick-links.json');

module.exports = {
  readStudents,
  writeStudents,
  findByEmail,
  findById,
  addStudent,
  removeStudent,
  updateStudentPasswordHash,
  recordFailedLogin,
  clearFailedLogins,
  readContent,
  writeContent,

  readVoicePosts: voicePosts.read,
  writeVoicePosts: voicePosts.write,

  readSlideArchive: slideArchive.read,
  writeSlideArchive: slideArchive.write,

  readClubs: clubs.read,
  writeClubs: clubs.write,

  readCsEvents: csEvents.read,
  writeCsEvents: csEvents.write,

  readAnnouncements: announcements.read,
  writeAnnouncements: announcements.write,

  readCalendarEvents: calendarEvents.read,
  writeCalendarEvents: calendarEvents.write,

  readCouncil: council.read,
  writeCouncil: council.write,

  readProjects: projects.read,
  writeProjects: projects.write,

  readQuickLinks: quickLinks.read,
  writeQuickLinks: quickLinks.write,

  DEFAULT_CONTENT,
};
