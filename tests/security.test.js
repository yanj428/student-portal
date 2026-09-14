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

async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: 'test-admin-pw' });
  return agent;
}

async function lockOut(email) {
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/login').send({ email, password: 'wrong' });
  }
}

test('security endpoints require an admin session', async () => {
  const res1 = await request(app).get('/api/admin/security/locked');
  assert.equal(res1.status, 401);
  const res2 = await request(app).post('/api/admin/security/unlock').send({ email: 'x@kpis.ac.th' });
  assert.equal(res2.status, 401);
  const res3 = await request(app).post('/api/admin/security/unlock-all');
  assert.equal(res3.status, 401);
  const res4 = await request(app).get('/api/admin/security/attempts');
  assert.equal(res4.status, 401);
});

test('locked accounts show up in the admin security list and can be unlocked individually', async () => {
  const email = 'locked.one@kpis.ac.th';
  await lockOut(email);

  const admin = await loginAsAdmin();
  const listed = await admin.get('/api/admin/security/locked');
  assert.equal(listed.status, 200);
  assert.ok(listed.body.locked.some((entry) => entry.email === email));

  const unlocked = await admin.post('/api/admin/security/unlock').send({ email });
  assert.equal(unlocked.status, 200);

  const listedAfter = await admin.get('/api/admin/security/locked');
  assert.ok(!listedAfter.body.locked.some((entry) => entry.email === email));

  const loginAgain = await request(app).post('/api/login').send({ email, password: 'still-wrong-but-not-locked' });
  assert.equal(loginAgain.status, 401); // unlocked, so it's a normal wrong-password response, not a lock
});

test('unlock-all clears every locked email at once', async () => {
  await lockOut('bulk1@kpis.ac.th');
  await lockOut('bulk2@kpis.ac.th');

  const admin = await loginAsAdmin();
  const before = await admin.get('/api/admin/security/locked');
  assert.ok(before.body.locked.length >= 2);

  const res = await admin.post('/api/admin/security/unlock-all');
  assert.equal(res.status, 200);

  const after = await admin.get('/api/admin/security/locked');
  assert.equal(
    after.body.locked.some((e) => e.email === 'bulk1@kpis.ac.th' || e.email === 'bulk2@kpis.ac.th'),
    false
  );
});

test('login attempts are logged and filterable by email', async () => {
  const email = 'logged.attempt@kpis.ac.th';
  await request(app).post('/api/login').send({ email, password: 'wrong' });

  const admin = await loginAsAdmin();
  const res = await admin.get(`/api/admin/security/attempts?email=${encodeURIComponent(email)}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.attempts.length >= 1);
  assert.equal(res.body.attempts[0].email, email);
  assert.equal(res.body.attempts[0].success, 0);
});
