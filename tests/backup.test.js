const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('node:child_process');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const Database = require('better-sqlite3');

const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpis-backup-test-'));

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(backupDir, { recursive: true, force: true });
});

function runBackup(extraEnv) {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'backup.js')], {
    env: { ...process.env, DATA_DIR: dataDir, BACKUP_DIR: backupDir, ...extraEnv },
  });
}

test('backup copies real data and each backup is independently readable', async () => {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  await admin.post('/api/admin/students').send({ firstName: 'Bak', lastName: 'Up', email: 'backup.check@kpis.ac.th', grade: '10' });

  runBackup();

  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
  assert.equal(files.length, 1);

  const backupDb = new Database(path.join(backupDir, files[0]), { readonly: true });
  const student = backupDb.prepare('SELECT email FROM students WHERE email = ?').get('backup.check@kpis.ac.th');
  backupDb.close();
  assert.equal(student.email, 'backup.check@kpis.ac.th');
});

test('rotation keeps only the configured number of most recent backups', async () => {
  for (const f of fs.readdirSync(backupDir)) fs.rmSync(path.join(backupDir, f));

  for (let i = 0; i < 5; i++) {
    runBackup({ BACKUP_KEEP_DAILY: '3' });
  }

  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
  assert.equal(files.length, 3);
});
