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
  const res = await admin
    .post('/api/admin/students')
    .send({ firstName: 'Sam', lastName: 'Lee', email, grade: '11' });
  return res.body.password;
}

test('account locks after 10 failed attempts and blocks further logins, even with the right password', async () => {
  const email = 'sam.lee@kpis.ac.th';
  const password = await createStudent(email);

  let lastRes;
  for (let i = 0; i < 9; i++) {
    lastRes = await request(app).post('/api/login').send({ email, password: 'wrong' });
    assert.equal(lastRes.status, 401);
    assert.equal(lastRes.body.locked, undefined);
  }

  // 10th wrong attempt trips the lock.
  const lockingAttempt = await request(app).post('/api/login').send({ email, password: 'wrong' });
  assert.equal(lockingAttempt.status, 403);
  assert.equal(lockingAttempt.body.locked, true);
  assert.match(lockingAttempt.body.error, /student council/i);

  // Even the correct password is now rejected.
  const correctAfterLock = await request(app).post('/api/login').send({ email, password });
  assert.equal(correctAfterLock.status, 403);
  assert.equal(correctAfterLock.body.locked, true);
});

test('successful login clears the failed-attempt counter', async () => {
  const email = 'ari.chan@kpis.ac.th';
  const password = await createStudent(email);

  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/login').send({ email, password: 'wrong' });
  }

  const goodLogin = await request(app).post('/api/login').send({ email, password });
  assert.equal(goodLogin.status, 200);

  // Counter reset — 9 more wrong attempts should still not lock the account.
  for (let i = 0; i < 9; i++) {
    const res = await request(app).post('/api/login').send({ email, password: 'wrong' });
    assert.equal(res.status, 401);
  }
  const stillCorrect = await request(app).post('/api/login').send({ email, password });
  assert.equal(stillCorrect.status, 200);
});
