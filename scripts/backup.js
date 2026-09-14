// Makes a consistent, point-in-time copy of the live database using
// better-sqlite3's own backup API (safe to run while the server is up —
// it doesn't just copy the file, which could catch it mid-write), then
// deletes old backups beyond the retention counts below.
//
// Run manually with `npm run backup`, or schedule it (e.g. Windows Task
// Scheduler running `node scripts/backup.js` once a day) for real
// protection against data loss — a copy that only exists on the same
// machine as the original doesn't survive that machine failing, so once
// this app is on a real server, point BACKUP_DIR at (or additionally sync
// it to) storage that isn't just another folder on the same disk.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'portal.db');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(__dirname, '..', 'backups');

const KEEP_DAILY = parseInt(process.env.BACKUP_KEEP_DAILY, 10) || 14;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`No database found at ${DB_FILE} — nothing to back up.`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const destination = path.join(BACKUP_DIR, `portal-${timestamp()}.db`);
  const db = new Database(DB_FILE, { readonly: true });
  await db.backup(destination);
  db.close();
  console.log(`Backed up to ${destination}`);

  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('portal-') && f.endsWith('.db'))
    .sort(); // filenames are ISO timestamps, so lexical sort is chronological
  const toDelete = backups.slice(0, Math.max(0, backups.length - KEEP_DAILY));
  for (const file of toDelete) {
    // Opening a backup file (even read-only, e.g. to verify it) can leave
    // WAL/SHM sidecar files next to it — remove those along with it.
    for (const suffix of ['', '-wal', '-shm']) {
      const p = path.join(BACKUP_DIR, file + suffix);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    console.log(`Removed old backup ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
