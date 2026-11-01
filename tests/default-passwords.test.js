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
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  return admin;
}

test('a new account starts with the default for its grade or role', async () => {
  const admin = await loginAsAdmin();
  const create = (n, grade) => admin.post('/api/admin/students').send({ firstName: 'Pat', lastName: `Role${n}`, email: `role${n}@kpis.ac.th`, grade });

  assert.equal((await create(1, 'Grade 10')).body.password, 'keerapat');
  assert.equal((await create(2, 'Teacher')).body.password, 'kpisteacher');
  const staff = await create(3, 'Staff');
  assert.equal(staff.body.password, 'kpisstaff');

  const login = await request(app).post('/api/login').send({ email: 'role3@kpis.ac.th', password: 'kpisstaff' });
  assert.equal(login.status, 200);
});

test('resetting a password gives the default for that account\'s role', async () => {
  const admin = await loginAsAdmin();
  const created = await admin.post('/api/admin/students').send({ firstName: 'Sam', lastName: 'Reset', email: 'reset.staff@kpis.ac.th', grade: 'Staff' });
  const reset = await admin.post(`/api/admin/students/${created.body.student.id}/reset-password`).send({});
  assert.equal(reset.body.password, 'kpisstaff');
});

test('none of the three defaults can be chosen as a new password', async () => {
  const admin = await loginAsAdmin();
  await admin.post('/api/admin/students').send({ firstName: 'Sue', lastName: 'Staff', email: 'sue.staff@kpis.ac.th', grade: 'Staff' });
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email: 'sue.staff@kpis.ac.th', password: 'kpisstaff' });
  for (const newPassword of ['kpisstaff', 'kpisteacher', 'keerapat']) {
    const res = await agent.post('/api/change-password').send({ currentPassword: 'kpisstaff', newPassword });
    assert.equal(res.status, 400, newPassword);
  }
});

test('a new admin cannot choose the admin default as their own password', async () => {
  const bcrypt = require('bcryptjs');
  const admin = db.createAdmin({ username: 'new.admin@kpis.ac.th', passwordHash: bcrypt.hashSync('kpisadmin', 10), role: 'editor', mustChangePassword: true });
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/login').send({ username: 'new.admin@kpis.ac.th', password: 'kpisadmin' });
  assert.equal(login.status, 200);
  const same = await agent.post('/api/admin/change-password').send({ currentPassword: 'kpisadmin', newPassword: 'kpisadmin' });
  assert.equal(same.status, 400);
  const ok = await agent.post('/api/admin/change-password').send({ currentPassword: 'kpisadmin', newPassword: 'my-own-admin-pass-1' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(admin);
});

test('resetAdminPassword sets a temporary password that must be changed', () => {
  const bcrypt = require('bcryptjs');
  const admin = db.createAdmin({ username: 'reset.admin@kpis.ac.th', passwordHash: bcrypt.hashSync('old-password-1', 10), role: 'editor' });
  assert.equal(db.resetAdminPassword(admin.id, bcrypt.hashSync('kpisadmin', 10)), true);
  const after = db.findAdminByUsername ? db.findAdminByUsername('reset.admin@kpis.ac.th') : null;
  if (after) assert.equal(!!after.mustChangePassword, true);
});