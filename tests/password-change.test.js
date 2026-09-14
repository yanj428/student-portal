const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

async function createLoggedInStudent(email) {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const created = await admin
    .post('/api/admin/students')
    .send({ firstName: 'Nok', lastName: 'Wat', email, grade: '9' });

  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password: created.body.password });
  return { agent, defaultPassword: created.body.password };
}

test('change-password requires an existing session', async () => {
  const res = await request(app)
    .post('/api/change-password')
    .send({ currentPassword: 'x', newPassword: 'brandnew123' });
  assert.equal(res.status, 401);
});

test('rejects a new password shorter than 8 characters', async () => {
  const { agent, defaultPassword } = await createLoggedInStudent('nok.wat.1@kpis.ac.th');
  const res = await agent.post('/api/change-password').send({ currentPassword: defaultPassword, newPassword: 'short' });
  assert.equal(res.status, 400);
});

test('rejects setting the new password back to the shared default', async () => {
  const { agent, defaultPassword } = await createLoggedInStudent('nok.wat.2@kpis.ac.th');
  const res = await agent
    .post('/api/change-password')
    .send({ currentPassword: defaultPassword, newPassword: defaultPassword });
  assert.equal(res.status, 400);
});

test('rejects the wrong current password', async () => {
  const { agent } = await createLoggedInStudent('nok.wat.3@kpis.ac.th');
  const res = await agent
    .post('/api/change-password')
    .send({ currentPassword: 'totally-wrong', newPassword: 'brandnew123' });
  assert.equal(res.status, 401);
});

test('successful change clears mustChangePassword and allows login with the new password', async () => {
  const email = 'nok.wat.4@kpis.ac.th';
  const { agent, defaultPassword } = await createLoggedInStudent(email);

  const changed = await agent
    .post('/api/change-password')
    .send({ currentPassword: defaultPassword, newPassword: 'brandnew123' });
  assert.equal(changed.status, 200);

  const me = await agent.get('/api/me');
  assert.equal(me.body.student.mustChangePassword, false);

  const reLogin = await request(app).post('/api/login').send({ email, password: 'brandnew123' });
  assert.equal(reLogin.status, 200);
  assert.equal(reLogin.body.student.mustChangePassword, false);

  // Old default password no longer works.
  const oldLogin = await request(app).post('/api/login').send({ email, password: defaultPassword });
  assert.equal(oldLogin.status, 401);
});
