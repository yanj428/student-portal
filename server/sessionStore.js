const { Store } = require('express-session');

// A minimal express-session Store backed by the same SQLite database as
// everything else, so sessions survive a server restart and can be
// inspected/cleared the same way as any other table — instead of living in
// process memory, where a restart silently logs everyone out and there's no
// way for an admin to revoke one session.
class SqliteSessionStore extends Store {
  constructor(db) {
    super();
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expiresAt);
    `);
    this.getStmt = db.prepare('SELECT data, expiresAt FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare(`
      INSERT INTO sessions (sid, data, expiresAt) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expiresAt = excluded.expiresAt
    `);
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expiresAt = ? WHERE sid = ?');
    this.pruneStmt = db.prepare('DELETE FROM sessions WHERE expiresAt < ?');
    this.clearStmt = db.prepare('DELETE FROM sessions');
    this.countStmt = db.prepare('SELECT COUNT(*) AS c FROM sessions');
  }

  maxAgeOf(session) {
    return (session.cookie && session.cookie.maxAge) || 24 * 60 * 60 * 1000;
  }

  get(sid, callback) {
    this.pruneStmt.run(Date.now());
    const row = this.getStmt.get(sid);
    if (!row) return callback(null, null);
    if (row.expiresAt < Date.now()) {
      this.destroyStmt.run(sid);
      return callback(null, null);
    }
    try {
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, session, callback) {
    this.setStmt.run(sid, JSON.stringify(session), Date.now() + this.maxAgeOf(session));
    if (callback) callback();
  }

  destroy(sid, callback) {
    this.destroyStmt.run(sid);
    if (callback) callback();
  }

  touch(sid, session, callback) {
    this.touchStmt.run(Date.now() + this.maxAgeOf(session), sid);
    if (callback) callback();
  }

  length(callback) {
    callback(null, this.countStmt.get().c);
  }

  clear(callback) {
    this.clearStmt.run();
    if (callback) callback();
  }
}

module.exports = SqliteSessionStore;
