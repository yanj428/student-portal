const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const {
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_WINDOW_MINUTES,
  LOGIN_LOCKOUT_BASE_MINUTES,
  LOGIN_LOCKOUT_MAX_MINUTES,
  LOGIN_ATTEMPT_LOG_RETENTION_DAYS,
  ADMIN_PASSWORD,
  ADMIN_BOOTSTRAP_USERNAME,
} = require('./config');

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

  -- Tracks failed-login throttling per email, whether or not that email
  -- belongs to a real account — this is what makes the "account locked"
  -- response identical for a real student and a guessed email, so a lockout
  -- can't be used to find out which emails exist.
  CREATE TABLE IF NOT EXISTS login_throttle (
    email TEXT PRIMARY KEY,
    failedAttempts INTEGER NOT NULL DEFAULT 0,
    firstFailedAt TEXT,
    lockoutCount INTEGER NOT NULL DEFAULT 0,
    lockedUntil TEXT
  );

  -- An audit trail of every login attempt, for the admin Security tab.
  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    success INTEGER NOT NULL,
    reason TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts (createdAt);
  CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email);

  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    totpSecret TEXT,
    totpEnabled INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adminUsername TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log (createdAt);

  -- One-time-use codes for an admin who enables 2FA and later loses their
  -- authenticator device — without these, losing the device would mean
  -- permanently losing access to that account (and, for the sole owner,
  -- to admin account management entirely).
  CREATE TABLE IF NOT EXISTS admin_recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adminId TEXT NOT NULL,
    codeHash TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_admin ON admin_recovery_codes (adminId);
`);

// Adds a column to an existing table if it's missing — needed because the
// CREATE TABLE above only applies to a brand-new database; a database
// created before role/totpSecret/totpEnabled existed needs them added in
// place, without losing its existing admin rows.
// Returns true if the column had to be added (i.e. this is an existing
// database created before it existed), false if it was already there.
function ensureColumn(table, column, ddl) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some((col) => col.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  return true;
}
// A database created before admin accounts were username-based still has
// the old `email`/`adminEmail` columns — rename them in place so existing
// admin rows (and their already-hashed passwords) survive the switch
// instead of silently losing access.
function renameColumnIfNeeded(table, oldName, newName) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some((col) => col.name === newName)) return;
  if (existing.some((col) => col.name === oldName)) {
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
  }
}
renameColumnIfNeeded('admins', 'email', 'username');
renameColumnIfNeeded('admin_audit_log', 'adminEmail', 'adminUsername');

const roleColumnJustAdded = ensureColumn('admins', 'role', "role TEXT NOT NULL DEFAULT 'editor'");
ensureColumn('admins', 'totpSecret', 'totpSecret TEXT');
ensureColumn('admins', 'totpEnabled', 'totpEnabled INTEGER NOT NULL DEFAULT 0');

// Every admin that already existed before roles did becomes an owner (not
// silently downgraded to the new, more limited 'editor' default) — running
// with fewer admin permissions than before would be a surprising side
// effect of an unrelated feature update, not a deliberate choice. Only
// runs the one time the role column itself is being added.
if (roleColumnJustAdded) {
  db.prepare("UPDATE admins SET role = 'owner'").run();
}

// The very first time this runs against a database with no admin accounts
// yet, create one from ADMIN_PASSWORD so the existing single-password
// workflow keeps working — after that, admins manage their own accounts
// and this environment variable is no longer read for authentication.
(function ensureAdminsBootstrap() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM admins').get();
  if (c > 0) return;
  // Always 'owner' — the very first admin has to be, since there'd
  // otherwise be no owner at all to create one.
  db.prepare("INSERT INTO admins (id, username, passwordHash, role, createdAt) VALUES (?, ?, ?, 'owner', ?)").run(
    crypto.randomUUID(),
    ADMIN_BOOTSTRAP_USERNAME.toLowerCase(),
    bcrypt.hashSync(ADMIN_PASSWORD, 10),
    new Date().toISOString()
  );
})();

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
  const student = findById(id);
  if (!student) return null;
  db.prepare(`
    UPDATE students
    SET passwordHash = ?, mustChangePassword = ?, failedLoginAttempts = 0, locked = 0
    WHERE id = ?
  `).run(passwordHash, mustChangePassword ? 1 : 0, id);
  // A password change or an admin reset is also a full unlock: it clears
  // both the permanent admin lock (above) and any timed lockout in progress.
  clearThrottle(student.email);
  return findById(id);
}

// ---- Login throttling (timed lockout, doubling on repeat offenses) ----
//
// Keyed by email rather than student id so a nonexistent email throttles
// exactly the same way a real one does — see the comment on the
// login_throttle table above.

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getThrottle(email) {
  const key = normalizeEmail(email);
  const row = db.prepare('SELECT * FROM login_throttle WHERE email = ?').get(key);
  return row || { email: key, failedAttempts: 0, firstFailedAt: null, lockoutCount: 0, lockedUntil: null };
}

function isThrottleLocked(throttle) {
  return !!(throttle.lockedUntil && new Date(throttle.lockedUntil).getTime() > Date.now());
}

function upsertThrottle(t) {
  db.prepare(`
    INSERT INTO login_throttle (email, failedAttempts, firstFailedAt, lockoutCount, lockedUntil)
    VALUES (@email, @failedAttempts, @firstFailedAt, @lockoutCount, @lockedUntil)
    ON CONFLICT(email) DO UPDATE SET
      failedAttempts = excluded.failedAttempts,
      firstFailedAt = excluded.firstFailedAt,
      lockoutCount = excluded.lockoutCount,
      lockedUntil = excluded.lockedUntil
  `).run(t);
}

// Records one failed login and returns the updated throttle state. Failed
// attempts roll off after LOGIN_LOCKOUT_WINDOW_MINUTES with no further
// failures; hitting the threshold within the window locks the email out for
// LOGIN_LOCKOUT_BASE_MINUTES, doubling on each subsequent lockout (capped at
// LOGIN_LOCKOUT_MAX_MINUTES) until a successful login clears it.
function recordFailedAttempt(email) {
  const key = normalizeEmail(email);
  const now = Date.now();
  const t = getThrottle(key);

  const windowMs = LOGIN_LOCKOUT_WINDOW_MINUTES * 60 * 1000;
  const windowExpired = t.firstFailedAt && now - new Date(t.firstFailedAt).getTime() > windowMs;
  const startingFreshWindow = windowExpired || !t.firstFailedAt;

  let failedAttempts = startingFreshWindow ? 1 : t.failedAttempts + 1;
  let firstFailedAt = startingFreshWindow ? new Date(now).toISOString() : t.firstFailedAt;
  let lockoutCount = t.lockoutCount;
  let lockedUntil = null;

  if (failedAttempts >= LOGIN_LOCKOUT_THRESHOLD) {
    lockoutCount += 1;
    const minutes = Math.min(LOGIN_LOCKOUT_BASE_MINUTES * 2 ** (lockoutCount - 1), LOGIN_LOCKOUT_MAX_MINUTES);
    lockedUntil = new Date(now + minutes * 60 * 1000).toISOString();
    failedAttempts = 0;
    firstFailedAt = null;
  }

  upsertThrottle({ email: key, failedAttempts, firstFailedAt, lockoutCount, lockedUntil });
  return getThrottle(key);
}

function clearThrottle(email) {
  const key = normalizeEmail(email);
  db.prepare(`
    INSERT INTO login_throttle (email, failedAttempts, firstFailedAt, lockoutCount, lockedUntil)
    VALUES (?, 0, NULL, 0, NULL)
    ON CONFLICT(email) DO UPDATE SET failedAttempts = 0, firstFailedAt = NULL, lockoutCount = 0, lockedUntil = NULL
  `).run(key);
}

// Combines the timed lockout (login_throttle) with a permanent admin lock
// (the students.locked column) into the single "is this account currently
// blocked" answer the login route and the public student shape both need.
function getLockStatus(email) {
  const key = normalizeEmail(email);
  const student = findByEmail(key);
  const throttle = getThrottle(key);
  const timedLocked = isThrottleLocked(throttle);
  const adminLocked = !!(student && student.locked);
  return {
    locked: timedLocked || adminLocked,
    lockedUntil: timedLocked ? throttle.lockedUntil : null,
    adminLocked,
  };
}

function setAdminLocked(id, locked) {
  return db.prepare('UPDATE students SET locked = ? WHERE id = ?').run(locked ? 1 : 0, id).changes > 0;
}

function recordLoginAttempt({ email, ip, success, reason }) {
  db.prepare('INSERT INTO login_attempts (email, ip, success, reason, createdAt) VALUES (?, ?, ?, ?, ?)').run(
    normalizeEmail(email),
    ip || '',
    success ? 1 : 0,
    reason || null,
    new Date().toISOString()
  );
  const cutoff = new Date(Date.now() - LOGIN_ATTEMPT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM login_attempts WHERE createdAt < ?').run(cutoff);
}

function listLoginAttempts({ email, ip, limit } = {}) {
  let query = 'SELECT * FROM login_attempts WHERE 1=1';
  const params = [];
  if (email) {
    query += ' AND email = ?';
    params.push(normalizeEmail(email));
  }
  if (ip) {
    query += ' AND ip = ?';
    params.push(ip);
  }
  query += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(Math.min(limit || 100, 500));
  return db.prepare(query).all(...params);
}

// Everything currently locked, timed or permanent, for the admin Security
// tab — keyed by email since a timed lock can exist for an email with no
// matching student (someone guessing addresses that don't exist).
function listLockedAccounts() {
  const now = new Date().toISOString();
  const throttled = db.prepare('SELECT * FROM login_throttle WHERE lockedUntil IS NOT NULL AND lockedUntil > ?').all(now);
  const adminLockedStudents = db.prepare('SELECT * FROM students WHERE locked = 1').all().map(rowToStudent);

  const byEmail = new Map();
  for (const t of throttled) {
    byEmail.set(t.email, {
      email: t.email,
      lockedUntil: t.lockedUntil,
      lockoutCount: t.lockoutCount,
      adminLocked: false,
      student: findByEmail(t.email),
    });
  }
  for (const s of adminLockedStudents) {
    const key = normalizeEmail(s.email);
    const existing = byEmail.get(key);
    if (existing) existing.adminLocked = true;
    else byEmail.set(key, { email: key, lockedUntil: null, lockoutCount: 0, adminLocked: true, student: s });
  }
  return Array.from(byEmail.values());
}

function unlockEmail(email) {
  const key = normalizeEmail(email);
  clearThrottle(key);
  const student = findByEmail(key);
  if (student) db.prepare('UPDATE students SET locked = 0 WHERE id = ?').run(student.id);
}

function unlockAllLocked() {
  db.prepare(`
    UPDATE login_throttle SET failedAttempts = 0, firstFailedAt = NULL, lockoutCount = 0, lockedUntil = NULL
    WHERE lockedUntil IS NOT NULL
  `).run();
  db.prepare('UPDATE students SET locked = 0 WHERE locked = 1').run();
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

// Only these collections (public site content, not accounts or the private
// Voice suggestion box) feed the checked-in seed - see seedWriter.js for why
// this stays a no-op outside a normal local dev run.
const { scheduleSeedSnapshot } = require('./seedWriter');
function withSeedSync(writeFn) {
  return (...args) => {
    const result = writeFn(...args);
    scheduleSeedSnapshot();
    return result;
  };
}

module.exports = {
  readStudents,
  writeStudents,
  findByEmail,
  findById,
  addStudent,
  removeStudent,
  updateStudentPasswordHash,
  readContent,
  writeContent: withSeedSync(writeContent),

  getThrottle,
  recordFailedAttempt,
  clearThrottle,
  getLockStatus,
  setAdminLocked,
  recordLoginAttempt,
  listLoginAttempts,
  listLockedAccounts,
  unlockEmail,
  unlockAllLocked,

  readVoicePosts: voicePosts.read,
  writeVoicePosts: voicePosts.write,

  readSlideArchive: slideArchive.read,
  writeSlideArchive: withSeedSync(slideArchive.write),

  readClubs: clubs.read,
  writeClubs: withSeedSync(clubs.write),

  readCsEvents: csEvents.read,
  writeCsEvents: withSeedSync(csEvents.write),

  readAnnouncements: announcements.read,
  writeAnnouncements: withSeedSync(announcements.write),

  readCalendarEvents: calendarEvents.read,
  writeCalendarEvents: withSeedSync(calendarEvents.write),

  readCouncil: council.read,
  writeCouncil: withSeedSync(council.write),

  readProjects: projects.read,
  writeProjects: withSeedSync(projects.write),

  readQuickLinks: quickLinks.read,
  writeQuickLinks: withSeedSync(quickLinks.write),

  DEFAULT_CONTENT,

  // Closes the underlying SQLite connection so its file handle is released —
  // needed by tests that delete their temp data directory afterward
  // (Windows won't remove a directory containing an open file).
  close: () => db.close(),

  // The raw connection, for things that need direct SQL and want to share
  // this same portal.db file/connection rather than opening a second one —
  // currently just the session store (server/sessionStore.js).
  rawConnection: db,

  // ---- Admin accounts ----
  findAdminByUsername(username) {
    return db.prepare('SELECT * FROM admins WHERE lower(username) = ?').get(username.trim().toLowerCase()) || null;
  },
  findAdminById(id) {
    return db.prepare('SELECT * FROM admins WHERE id = ?').get(id) || null;
  },
  listAdmins() {
    return db.prepare('SELECT id, username, role, totpEnabled, createdAt FROM admins ORDER BY createdAt').all();
  },
  adminCount() {
    return db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  },
  ownerCount() {
    return db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role = 'owner'").get().c;
  },
  createAdmin({ username, passwordHash, role }) {
    const admin = {
      id: crypto.randomUUID(),
      username: username.trim().toLowerCase(),
      passwordHash,
      role: role === 'owner' ? 'owner' : 'editor',
      createdAt: new Date().toISOString(),
    };
    db.prepare('INSERT INTO admins (id, username, passwordHash, role, createdAt) VALUES (@id, @username, @passwordHash, @role, @createdAt)').run(admin);
    return admin;
  },
  updateAdminPasswordHash(id, passwordHash) {
    return db.prepare('UPDATE admins SET passwordHash = ? WHERE id = ?').run(passwordHash, id).changes > 0;
  },
  updateAdminRole(id, role) {
    return db.prepare('UPDATE admins SET role = ? WHERE id = ?').run(role === 'owner' ? 'owner' : 'editor', id).changes > 0;
  },
  deleteAdmin(id) {
    return db.prepare('DELETE FROM admins WHERE id = ?').run(id).changes > 0;
  },

  // ---- Admin two-factor authentication (TOTP) ----
  // "Pending" setup: a secret generated but not yet confirmed with a code,
  // so scanning the QR/entering the key doesn't turn on 2FA until the admin
  // proves they actually saved it correctly.
  setPendingTotpSecret(id, secret) {
    db.prepare('UPDATE admins SET totpSecret = ?, totpEnabled = 0 WHERE id = ?').run(secret, id);
  },
  enableTotp(id) {
    db.prepare('UPDATE admins SET totpEnabled = 1 WHERE id = ?').run(id);
  },
  disableTotp(id) {
    db.prepare('UPDATE admins SET totpSecret = NULL, totpEnabled = 0 WHERE id = ?').run(id);
    db.prepare('DELETE FROM admin_recovery_codes WHERE adminId = ?').run(id);
  },
  replaceRecoveryCodes(adminId, codeHashes) {
    const del = db.prepare('DELETE FROM admin_recovery_codes WHERE adminId = ?');
    const insert = db.prepare('INSERT INTO admin_recovery_codes (adminId, codeHash, createdAt) VALUES (?, ?, ?)');
    const tx = db.transaction((hashes) => {
      del.run(adminId);
      const createdAt = new Date().toISOString();
      for (const hash of hashes) insert.run(adminId, hash, createdAt);
    });
    tx(codeHashes);
  },
  // Marks a matching, unused recovery code as used and returns true — or
  // returns false without changing anything if no unused code matches.
  consumeRecoveryCode(adminId, codeHash) {
    const row = db
      .prepare('SELECT id FROM admin_recovery_codes WHERE adminId = ? AND codeHash = ? AND used = 0')
      .get(adminId, codeHash);
    if (!row) return false;
    db.prepare('UPDATE admin_recovery_codes SET used = 1 WHERE id = ?').run(row.id);
    return true;
  },
  countUnusedRecoveryCodes(adminId) {
    return db.prepare('SELECT COUNT(*) AS c FROM admin_recovery_codes WHERE adminId = ? AND used = 0').get(adminId).c;
  },

  // ---- Admin audit log ----
  logAuditEvent(adminUsername, action, details) {
    // Falls back rather than throwing if adminUsername is missing (e.g. a
    // session created before adminUsername existed on the session) — an
    // audit log entry that says "unknown" is far better than a 500 on the
    // action it was trying to record.
    db.prepare('INSERT INTO admin_audit_log (adminUsername, action, details, createdAt) VALUES (?, ?, ?, ?)').run(
      adminUsername || 'unknown',
      action,
      details ? JSON.stringify(details) : null,
      new Date().toISOString()
    );
  },
  listAuditLog({ limit } = {}) {
    return db
      .prepare('SELECT * FROM admin_audit_log ORDER BY createdAt DESC LIMIT ?')
      .all(Math.min(limit || 100, 500))
      .map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null }));
  },

  // Logs a student out everywhere except (optionally) the session making
  // this call, so a password change or an admin reset can't be undone by
  // someone who already has an active session with the old password.
  // Reads the sessions table the session store owns, so it's a no-op (not
  // an error) before that table exists yet.
  destroyOtherStudentSessions(studentId, exceptSid) {
    destroySessionsMatching((session) => session.studentId === studentId, exceptSid);
  },

  // Same idea for admin accounts: used when an admin changes their own
  // password (keeps the current session, drops any others), and when an
  // admin account is deleted (no exceptSid — every session for it dies).
  destroyOtherAdminSessions(adminId, exceptSid) {
    destroySessionsMatching((session) => session.adminId === adminId, exceptSid);
  },
  destroyAdminSessions(adminId) {
    destroySessionsMatching((session) => session.adminId === adminId);
  },
};

function destroySessionsMatching(predicate, exceptSid) {
  let rows;
  try {
    rows = db.prepare('SELECT sid, data FROM sessions WHERE sid != ?').all(exceptSid || '');
  } catch {
    return; // sessions table doesn't exist yet (e.g. store not initialized)
  }
  const del = db.prepare('DELETE FROM sessions WHERE sid = ?');
  for (const row of rows) {
    try {
      if (predicate(JSON.parse(row.data))) del.run(row.sid);
    } catch {
      // malformed session data — leave it for the store's own pruning
    }
  }
}
