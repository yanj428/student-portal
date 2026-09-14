const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function createStudent(email) {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const res = await admin.post('/api/admin/students').send({ firstName: 'Sam', lastName: 'Lee', email, grade: '11' });
  return res.body.password;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('account locks after 5 failed attempts, then auto-unlocks after the lockout window', async () => {
  const email = 'sam.lee@kpis.ac.th';
  const password = await createStudent(email);

  for (let i = 0; i < 4; i++) {
    const res = await request(app).post('/api/login').send({ email, password: 'wrong' });
    assert.equal(res.status, 401);
    assert.equal(res.body.locked, undefined);
  }

  // 5th wrong attempt trips the lock.
  const lockingAttempt = await request(app).post('/api/login').send({ email, password: 'wrong' });
  assert.equal(lockingAttempt.status, 403);
  assert.equal(lockingAttempt.body.locked, true);
  assert.match(lockingAttempt.body.error, /student council/i);
  assert.ok(lockingAttempt.body.retryAfterMinutes >= 1);

  // Even the correct password is rejected while locked.
  const correctWhileLocked = await request(app).post('/api/login').send({ email, password });
  assert.equal(correctWhileLocked.status, 403);
  assert.equal(correctWhileLocked.body.locked, true);

  // The lockout is timed (300ms in tests) — it clears on its own.
  await wait(400);
  const afterUnlock = await request(app).post('/api/login').send({ email, password });
  assert.equal(afterUnlock.status, 200);
});

test('a nonexistent email locks out identically to a real one (no account enumeration via lockout)', async () => {
  const email = 'nobody.here@kpis.ac.th';

  let lastRes;
  for (let i = 0; i < 5; i++) {
    lastRes = await request(app).post('/api/login').send({ email, password: 'wrong' });
  }
  assert.equal(lastRes.status, 403);
  assert.equal(lastRes.body.locked, true);
  assert.match(lastRes.body.error, /student council/i);
});

test('successive lockouts double in length', async () => {
  const email = 'doubling.test@kpis.ac.th';
  const password = await createStudent(email);

  // First lockout (~300ms).
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/login').send({ email, password: 'wrong' });
  }
  await wait(400);

  // Second lockout should take roughly twice as long (~600ms, capped there
  // by LOGIN_LOCKOUT_MAX_MINUTES in tests) — confirm it's still locked at
  // a point where the first lockout would already have cleared.
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/login').send({ email, password: 'wrong' });
  }
  await wait(400);
  const stillLocked = await request(app).post('/api/login').send({ email, password });
  assert.equal(stillLocked.status, 403);

  await wait(400);
  const finallyUnlocked = await request(app).post('/api/login').send({ email, password });
  assert.equal(finallyUnlocked.status, 200);
});

test('successful login clears the failed-attempt counter', async () => {
  const email = 'ari.chan@kpis.ac.th';
  const password = await createStudent(email);

  for (let i = 0; i < 3; i++) {
    await request(app).post('/api/login').send({ email, password: 'wrong' });
  }

  const goodLogin = await request(app).post('/api/login').send({ email, password });
  assert.equal(goodLogin.status, 200);

  // Counter reset — 4 more wrong attempts should still not lock the account.
  for (let i = 0; i < 4; i++) {
    const res = await request(app).post('/api/login').send({ email, password: 'wrong' });
    assert.equal(res.status, 401);
  }
  const stillCorrect = await request(app).post('/api/login').send({ email, password });
  assert.equal(stillCorrect.status, 200);
});

test('an admin-permanent lock does not auto-expire', async () => {
  const email = 'permalock@kpis.ac.th';
  const password = await createStudent(email);

  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const students = await admin.get('/api/admin/students');
  const student = students.body.students.find((s) => s.email === email);

  await admin.post(`/api/admin/students/${student.id}/lock`);

  const attempt = await request(app).post('/api/login').send({ email, password });
  assert.equal(attempt.status, 403);
  assert.equal(attempt.body.locked, true);
  assert.equal(attempt.body.retryAfterMinutes, null);

  await wait(400); // long enough that any timed lock would have cleared
  const stillLocked = await request(app).post('/api/login').send({ email, password });
  assert.equal(stillLocked.status, 403);

  await admin.post(`/api/admin/students/${student.id}/unlock`);
  const unlocked = await request(app).post('/api/login').send({ email, password });
  assert.equal(unlocked.status, 200);
});
