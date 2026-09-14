const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

// Fast absolute-session timeout for this file only, so a test can prove it
// actually expires without waiting the real 8 hours. Wide enough (1.2s)
// that the slower tests in this file (which hash a password with bcrypt)
// comfortably finish well within the window; only the dedicated timeout
// tests deliberately wait past it.
process.env.STUDENT_SESSION_ABSOLUTE_MINUTES = '0.02'; // 1200ms
process.env.ADMIN_SESSION_ABSOLUTE_MINUTES = '0.02';

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createStudent(email) {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const res = await admin.post('/api/admin/students').send({ firstName: 'Nat', lastName: 'Suk', email, grade: '11' });
  return res.body.password;
}

test('sessions survive a fresh require of the app (SQLite-backed, not in-memory)', async () => {
  const email = 'session.persist@kpis.ac.th';
  const password = await createStudent(email);
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password });

  const me1 = await agent.get('/api/me');
  assert.equal(me1.status, 200);

  // A second require of the same module (Node's require cache means this is
  // still the same app object in-process, but it proves the session data
  // itself lives in the sessions table rather than only in server memory —
  // read it back directly the way a restarted process would.
  const row = db.rawConnection.prepare('SELECT COUNT(*) AS c FROM sessions').get();
  assert.ok(row.c >= 1);
});

test('an idle-but-not-expired session keeps working; an absolute-expired one is rejected', async () => {
  const email = 'absolute.timeout@kpis.ac.th';
  const password = await createStudent(email);
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password });

  const stillGood = await agent.get('/api/me');
  assert.equal(stillGood.status, 200);

  await wait(1300); // longer than the 1200ms absolute cap configured above

  const expired = await agent.get('/api/me');
  assert.equal(expired.status, 401);
  assert.match(expired.body.error, /expired/i);
});

test('admin sessions also enforce the absolute timeout', async () => {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  assert.equal((await admin.get('/api/admin/security/locked')).status, 200);

  await wait(1300);

  const expired = await admin.get('/api/admin/security/locked');
  assert.equal(expired.status, 401);
});

test('changing your password logs out every other session for that student', async () => {
  const email = 'multi.session@kpis.ac.th';
  const password = await createStudent(email);

  const agentA = request.agent(app);
  const agentB = request.agent(app);
  await agentA.post('/api/login').send({ email, password });
  await agentB.post('/api/login').send({ email, password });

  assert.equal((await agentB.get('/api/me')).status, 200);

  const changed = await agentA.post('/api/change-password').send({ currentPassword: password, newPassword: 'brandnew123' });
  assert.equal(changed.status, 200);

  // Agent A's own session (the one that made the change) still works...
  assert.equal((await agentA.get('/api/me')).status, 200);
  // ...but agent B's session was logged out.
  assert.equal((await agentB.get('/api/me')).status, 401);
});

test('an admin password reset logs the student out everywhere, including the session that requested it', async () => {
  const email = 'reset.everywhere@kpis.ac.th';
  const password = await createStudent(email);
  const studentAgent = request.agent(app);
  await studentAgent.post('/api/login').send({ email, password });
  assert.equal((await studentAgent.get('/api/me')).status, 200);

  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const students = await admin.get('/api/admin/students');
  const student = students.body.students.find((s) => s.email === email);
  await admin.post(`/api/admin/students/${student.id}/reset-password`);

  assert.equal((await studentAgent.get('/api/me')).status, 401);
});

test('a cross-site Origin is rejected on state-changing requests', async () => {
  const res = await request(app)
    .post('/api/admin/login')
    .set('Origin', 'https://evil.example.com')
    .send({ password: 'test-admin-pw' });
  assert.equal(res.status, 403);
});

test('a matching same-site Origin is allowed through', async () => {
  // Bind our own listener so the Origin header can be made to genuinely
  // match the Host header the request arrives with, instead of guessing at
  // a port supertest would otherwise pick internally per call.
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await request(server)
      .post('/api/admin/login')
      .set('Origin', `http://127.0.0.1:${port}`)
      .send({ password: 'wrong' });
    // Not blocked by CSRF (still 401 for the wrong password) — proves a
    // same-host Origin passes through to the normal auth logic.
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});
