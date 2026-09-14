const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { normalizeUrl } = require('../server/utils/validateUrl');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Uses the bootstrap admin's username explicitly rather than the
// single-admin fallback — several tests in this file create additional
// admins that never get cleaned up, which would otherwise make a later
// bare-password login ambiguous (and correctly rejected as such).
async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'test-admin-pw' });
  return agent;
}

async function createStudent(email) {
  const admin = await loginAsAdmin();
  const res = await admin.post('/api/admin/students').send({ firstName: 'Sec', lastName: 'Audit', email, grade: '10' });
  return { admin, id: res.body.student.id, password: res.body.password };
}

// ---- Item 1: mustChangePassword is enforced by the API, not just the page redirect ----

test('a student still on the default password cannot use content APIs until they change it', async () => {
  const email = 'default.password@kpis.ac.th';
  const { password } = await createStudent(email);
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password });

  const clubs = await agent.get('/api/clubs');
  assert.equal(clubs.status, 403);

  const post = await agent.post('/api/voice/posts').send({ title: 't', category: 'Other', body: 'b' });
  assert.equal(post.status, 403);

  // /api/me and /api/change-password must still work — otherwise there'd
  // be no way to fix the mustChangePassword state at all.
  assert.equal((await agent.get('/api/me')).status, 200);
  const changed = await agent.post('/api/change-password').send({ currentPassword: password, newPassword: 'activepassword1' });
  assert.equal(changed.status, 200);

  // Now content APIs work.
  assert.equal((await agent.get('/api/clubs')).status, 200);
});

// ---- Item 2: locked/deleted accounts lose access immediately, not just on next login ----

test("locking a student's account immediately rejects their existing session, not just future logins", async () => {
  const email = 'lock.midsession@kpis.ac.th';
  const { admin, id, password } = await createStudent(email);
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password });
  await agent.post('/api/change-password').send({ currentPassword: password, newPassword: 'activepassword1' });
  assert.equal((await agent.get('/api/me')).status, 200);

  await admin.post(`/api/admin/students/${id}/lock`);

  const afterLock = await agent.get('/api/me');
  assert.equal(afterLock.status, 401);
});

test("deleting a student immediately rejects their existing session (and doesn't crash Voice)", async () => {
  const email = 'delete.midsession@kpis.ac.th';
  const { admin, id, password } = await createStudent(email);
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password });
  await agent.post('/api/change-password').send({ currentPassword: password, newPassword: 'activepassword1' });

  await admin.delete(`/api/admin/students/${id}`);

  assert.equal((await agent.get('/api/clubs')).status, 401);
  const post = await agent.post('/api/voice/posts').send({ title: 't', category: 'Other', body: 'b' });
  assert.equal(post.status, 401); // not a 500 — used to crash reading db.findById(...).id on a null student
});

test('deleting an admin immediately revokes that admin session, not just future logins', async () => {
  const owner = await loginAsAdmin();
  const created = await owner.post('/api/admin/admins').send({ username: 'doomed.admin', password: 'doomedpassword1' });

  const rogue = request.agent(app);
  await rogue.post('/api/admin/login').send({ username: 'doomed.admin', password: 'doomedpassword1' });
  assert.equal((await rogue.get('/api/admin/students')).status, 200);

  await owner.delete(`/api/admin/admins/${created.body.admin.id}`);

  assert.equal((await rogue.get('/api/admin/students')).status, 401);
});

test("an admin's other sessions are logged out when they change their own password", async () => {
  const owner = await loginAsAdmin();
  await owner.post('/api/admin/admins').send({ username: 'multi.session.admin', password: 'originalpassword1' });

  const sessionA = request.agent(app);
  const sessionB = request.agent(app);
  await sessionA.post('/api/admin/login').send({ username: 'multi.session.admin', password: 'originalpassword1' });
  await sessionB.post('/api/admin/login').send({ username: 'multi.session.admin', password: 'originalpassword1' });

  await sessionA.post('/api/admin/change-password').send({ currentPassword: 'originalpassword1', newPassword: 'newpassword12' });

  assert.equal((await sessionA.get('/api/admin/students')).status, 200); // the session that made the change survives
  assert.equal((await sessionB.get('/api/admin/students')).status, 401); // every other one doesn't
});

// ---- Item 10: admin login has its own lockout and shows up in the log ----

test('admin login locks out after repeated failures, distinct from any student lockout on the same username text', async () => {
  // Uses a throwaway admin (not the shared bootstrap admin other tests in
  // this file log in as) so locking it out here doesn't block those other
  // tests too.
  const owner = await loginAsAdmin();
  await owner.post('/api/admin/admins').send({ username: 'lockout.target.admin', password: 'lockouttargetpw1' });

  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/admin/login').send({ username: 'lockout.target.admin', password: 'wrong' });
  }
  const locked = await request(app).post('/api/admin/login').send({ username: 'lockout.target.admin', password: 'wrong' });
  assert.equal(locked.status, 403);
  assert.equal(locked.body.locked, true);

  // The correct password is rejected too while locked out.
  const correctWhileLocked = await request(app)
    .post('/api/admin/login')
    .send({ username: 'lockout.target.admin', password: 'lockouttargetpw1' });
  assert.equal(correctWhileLocked.status, 403);
});

test('admin login attempts are recorded in the security log', async () => {
  await request(app).post('/api/admin/login').send({ username: 'log.check.admin', password: 'wrong' });
  const owner = await loginAsAdmin();
  const res = await owner.get('/api/admin/security/attempts?email=admin:log.check.admin');
  assert.equal(res.status, 200);
  assert.ok(res.body.attempts.length >= 1);
});

// ---- Item 5: stored URLs are normalized, not stored as raw attacker text ----

test('normalizeUrl percent-encodes characters that could break out of an href attribute', () => {
  const dangerous = 'https://example.com/" onmouseover="alert(1)';
  const normalized = normalizeUrl(dangerous);
  assert.ok(!normalized.includes('"'));
  assert.ok(normalized.includes('%22'));
});

// ---- Item 8: server error logs never contain raw request bodies (passwords) ----

test('a malformed request body is never logged verbatim, even though it may contain a password', async () => {
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    await request(app)
      .post('/api/change-password')
      .set('Content-Type', 'application/json')
      .send('{"currentPassword":"TotallyRealSecret1",');
  } finally {
    console.error = originalError;
  }
  assert.ok(!logged.some((line) => line.includes('TotallyRealSecret1')));
});

// ---- Item 9: refuses to start in production with insecure/default secrets ----

test('refuses to start in production with the default ADMIN_PASSWORD or SESSION_SECRET', () => {
  const probe = path.join(__dirname, 'helpers', 'productionStartupProbe.js');
  // initTestEnv() (this whole file's setup) has already set ADMIN_PASSWORD
  // and SESSION_SECRET on process.env to non-default test values — spread
  // those in first, then explicitly force each one back to "" (config.js
  // treats an empty string the same as unset) to actually exercise the
  // "missing/default" case being tested, rather than inheriting a value
  // that would pass the check for the wrong reason.
  const runWith = (env) => {
    try {
      execFileSync('node', [probe], { env: { ...process.env, ...env }, stdio: 'pipe' });
      return { threw: false };
    } catch (err) {
      return { threw: true, stderr: err.stderr.toString() };
    }
  };

  const insecureAdmin = runWith({ NODE_ENV: 'production', ADMIN_PASSWORD: '', SESSION_SECRET: 'a-real-secret-value' });
  assert.equal(insecureAdmin.threw, true);
  assert.match(insecureAdmin.stderr, /ADMIN_PASSWORD/);

  const insecureSession = runWith({ NODE_ENV: 'production', ADMIN_PASSWORD: 'a-real-admin-password', SESSION_SECRET: '' });
  assert.equal(insecureSession.threw, true);
  assert.match(insecureSession.stderr, /SESSION_SECRET/);

  const bothSet = runWith({
    NODE_ENV: 'production',
    ADMIN_PASSWORD: 'a-real-admin-password',
    SESSION_SECRET: 'a-real-secret-value',
  });
  assert.equal(bothSet.threw, false);
});
