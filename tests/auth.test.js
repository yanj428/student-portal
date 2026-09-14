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

let studentCounter = 0;

// Each call creates a fresh student with a unique email so tests in this
// file don't collide with each other over the shared temp data directory.
async function createStudent() {
  const email = `jane.doe.${++studentCounter}@kpis.ac.th`;
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const res = await admin
    .post('/api/admin/students')
    .send({ firstName: 'Jane', lastName: 'Doe', email, grade: '10' });
  return { email, password: res.body.password };
}

test('student login rejects unknown email', async () => {
  const res = await request(app).post('/api/login').send({ email: 'nobody@kpis.ac.th', password: 'x' });
  assert.equal(res.status, 401);
});

test('student login rejects wrong password', async () => {
  const { email } = await createStudent();
  const res = await request(app).post('/api/login').send({ email, password: 'wrong-password' });
  assert.equal(res.status, 401);
});

test('student login succeeds with correct default password and flags mustChangePassword', async () => {
  const { email, password } = await createStudent();
  const res = await request(app).post('/api/login').send({ email, password });
  assert.equal(res.status, 200);
  assert.equal(res.body.student.email, email);
  assert.equal(res.body.student.mustChangePassword, true);
});

test('/api/me requires a session', async () => {
  const res = await request(app).get('/api/me');
  assert.equal(res.status, 401);
});

test('login then /api/me then logout then /api/me', async () => {
  const { email, password } = await createStudent();
  const agent = request.agent(app);

  const login = await agent.post('/api/login').send({ email, password });
  assert.equal(login.status, 200);

  const me = await agent.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.student.email, email);

  const logout = await agent.post('/api/logout');
  assert.equal(logout.status, 200);

  const meAfter = await agent.get('/api/me');
  assert.equal(meAfter.status, 401);
});
