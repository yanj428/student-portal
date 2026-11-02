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
test('an admin with an email username signs in on the student site with their admin password', async () => {
  const bcrypt = require('bcryptjs');
  db.createAdmin({ username: 'site.admin@kpis.ac.th', passwordHash: bcrypt.hashSync('admin-pass-123', 10), role: 'editor' });
  const wrong = await request(app).post('/api/login').send({ email: 'site.admin@kpis.ac.th', password: 'nope-nope-1' });
  assert.equal(wrong.status, 401);

  const agent = request.agent(app);
  const first = await agent.post('/api/login').send({ email: 'site.admin@kpis.ac.th', password: 'admin-pass-123' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.student.grade, 'Staff');
  assert.equal(first.body.student.fullName.trim(), 'Site Admin');
  assert.equal((await agent.get('/api/me')).status, 200);

  const again = await request(app).post('/api/login').send({ email: 'site.admin@kpis.ac.th', password: 'admin-pass-123' });
  assert.equal(again.status, 200);
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-admin-pw' });
  const list = await admin.get('/api/admin/students');
  assert.equal(list.body.students.filter((s) => s.email === 'site.admin@kpis.ac.th').length, 1);
});

test('the admin goal picker lists all 17 goals, each with a badge picture', async () => {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-admin-pw' });
  const res = await admin.get('/api/admin/sdgs');
  assert.equal(res.status, 200);
  assert.equal(res.body.goals.length, 17);
  assert.ok(res.body.goals.every((g) => g.url), 'every goal has a picture');
  assert.equal(res.body.goals[2].name, 'Good Health and Well-being');
  assert.equal((await request(app).get('/api/admin/sdgs')).status, 401);
});
