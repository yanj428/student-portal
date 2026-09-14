const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'portal.db');

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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    grade TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    mustChangePassword INTEGER NOT NULL DEFAULT 0,
    failedLoginAttempts INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS content (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  );

  -- Every other admin-manageable list (clubs, announcements, calendar
  -- events, council, projects, quick links, CS events, slide archive, voice
  -- posts) is a JSON blob per row in one shared table, keyed by which
  -- collection it belongs to. This mirrors the old one-JSON-array-per-file
  -- model closely enough that the route files above didn't need to change
  -- at all, while getting real transactional writes and no risk of two
  -- requests clobbering each other's read-modify-write of a whole file.
  CREATE TABLE IF NOT EXISTS collection_items (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    position INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
  CREATE INDEX IF NOT EXISTS idx_collection_items_collection_position
    ON collection_items (collection, position);
`);

function rowToStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    grade: row.grade,
    passwordHash: row.passwordHash,
    mustChangePassword: !!row.mustChangePassword,
    failedLoginAttempts: row.failedLoginAttempts,
    locked: !!row.locked,
    createdAt: row.createdAt,
  };
}

function readStudents() {
  return db.prepare('SELECT * FROM students ORDER BY createdAt').all().map(rowToStudent);
}

function writeStudents(students) {
  const upsert = db.prepare(`
    INSERT INTO students (id, firstName, lastName, email, grade, passwordHash, mustChangePassword, failedLoginAttempts, locked, createdAt)
    VALUES (@id, @firstName, @lastName, @email, @grade, @passwordHash, @mustChangePassword, @failedLoginAttempts, @locked, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      firstName = excluded.firstName,
      lastName = excluded.lastName,
      email = excluded.email,
      grade = excluded.grade,
      passwordHash = excluded.passwordHash,
      mustChangePassword = excluded.mustChangePassword,
      failedLoginAttempts = excluded.failedLoginAttempts,
      locked = excluded.locked,
      createdAt = excluded.createdAt
  `);
  const ids = students.map((s) => s.id);
  const replaceAll = db.transaction((items) => {
    db.prepare(`DELETE FROM students WHERE id NOT IN (${items.length ? items.map(() => '?').join(',') : "''"})`).run(...(items.length ? items : []));
    for (const s of students) {
      upsert.run({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        grade: s.grade,
        passwordHash: s.passwordHash,
        mustChangePassword: s.mustChangePassword ? 1 : 0,
        failedLoginAttempts: s.failedLoginAttempts || 0,
        locked: s.locked ? 1 : 0,
        createdAt: s.createdAt,
      });
    }
  });
  replaceAll(ids);
}

function findByEmail(email) {
  const normalized = email.trim().toLowerCase();
  return rowToStudent(db.prepare('SELECT * FROM students WHERE lower(email) = ?').get(normalized));
}

function findById(id) {
  return rowToStudent(db.prepare('SELECT * FROM students WHERE id = ?').get(id));
}

function addStudent(student) {
  db.prepare(`
    INSERT INTO students (id, firstName, lastName, email, grade, passwordHash, mustChangePassword, failedLoginAttempts, locked, createdAt)
    VALUES (@id, @firstName, @lastName, @email, @grade, @passwordHash, @mustChangePassword, @failedLoginAttempts, @locked, @createdAt)
  `).run({
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    grade: student.grade,
    passwordHash: student.passwordHash,
    mustChangePassword: student.mustChangePassword ? 1 : 0,
    failedLoginAttempts: student.failedLoginAttempts || 0,
    locked: student.locked ? 1 : 0,
    createdAt: student.createdAt,
  });
  return student;
}

function removeStudent(id) {
  return db.prepare('DELETE FROM students WHERE id = ?').run(id).changes > 0;
}

function updateStudentPasswordHash(id, passwordHash, mustChangePassword = false) {
  const result = db.prepare(`
    UPDATE students
    SET passwordHash = ?, mustChangePassword = ?, failedLoginAttempts = 0, locked = 0
    WHERE id = ?
  `).run(passwordHash, mustChangePassword ? 1 : 0, id);
  if (result.changes === 0) return null;
  return findById(id);
}

const MAX_FAILED_LOGIN_ATTEMPTS = 10;

function recordFailedLogin(id) {
  const student = findById(id);
  if (!student) return null;
  const failedLoginAttempts = (student.failedLoginAttempts || 0) + 1;
  const locked = failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? 1 : student.locked ? 1 : 0;
  db.prepare('UPDATE students SET failedLoginAttempts = ?, locked = ? WHERE id = ?').run(failedLoginAttempts, locked, id);
  return findById(id);
}

function clearFailedLogins(id) {
  const result = db.prepare('UPDATE students SET failedLoginAttempts = 0 WHERE id = ?').run(id);
  if (result.changes === 0) return null;
  return findById(id);
}

function readContent() {
  const row = db.prepare('SELECT data FROM content WHERE id = 1').get();
  let content;
  try {
    content = row ? JSON.parse(row.data) : { ...DEFAULT_CONTENT };
  } catch {
    content = { ...DEFAULT_CONTENT };
  }
  for (const key of Object.keys(DEFAULT_CONTENT)) {
    if (!(key in content)) content[key] = DEFAULT_CONTENT[key];
  }
  return content;
}

function writeContent(content) {
  db.prepare(`
    INSERT INTO content (id, data) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data
  `).run(JSON.stringify(content));
}

// A small SQLite-backed array collection: every admin-manageable list
// (clubs, announcements, calendar events, council, projects, quick links,
// CS events, slide archive, voice posts) follows the same read-array/
// write-array shape the routes already expect, so it's defined once here
// instead of once per collection.
function jsonCollection(name) {
  const selectAll = db.prepare('SELECT data FROM collection_items WHERE collection = ? ORDER BY position');
  const deleteAll = db.prepare('DELETE FROM collection_items WHERE collection = ?');
  const insert = db.prepare('INSERT INTO collection_items (collection, id, position, data) VALUES (?, ?, ?, ?)');

  return {
    read() {
      return selectAll.all(name).map((row) => JSON.parse(row.data));
    },
    write(items) {
      const replaceAll = db.transaction((list) => {
        deleteAll.run(name);
        list.forEach((item, index) => {
          insert.run(name, String(item.id), index, JSON.stringify(item));
        });
      });
      replaceAll(items);
    },
  };
}

const voicePosts = jsonCollection('voicePosts');
const slideArchive = jsonCollection('slideArchive');
const clubs = jsonCollection('clubs');
const csEvents = jsonCollection('csEvents');
const announcements = jsonCollection('announcements');
const calendarEvents = jsonCollection('calendarEvents');
const council = jsonCollection('council');
const projects = jsonCollection('projects');
const quickLinks = jsonCollection('quickLinks');

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

  // Closes the underlying SQLite connection so its file handle is released —
  // needed by tests that delete their temp data directory afterward
  // (Windows won't remove a directory containing an open file).
  close: () => db.close(),
};
