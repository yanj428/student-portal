const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { addAdmin } = require('./helpers/admins');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Uses the bootstrap admin's username explicitly (rather than relying on the
// single-admin fallback) since several tests in this file add a second
// admin, which would otherwise make later bare-password logins ambiguous.
async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'test-admin-pw' });
  return agent;
}

test('the bootstrap admin exists and can log in by username too, not just the single-admin fallback', async () => {
  const res = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'test-admin-pw' });
  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'admin');
});

test('a wrong username with the right password is rejected', async () => {
  const res = await request(app).post('/api/admin/login').send({ username: 'nobody', password: 'test-admin-pw' });
  assert.equal(res.status, 401);
});

test('adding a second admin requires username to disambiguate at login', async () => {
  addAdmin(db, { username: 'second.admin', password: 'anotherpassword1' });

  // With two admins now, omitting username at login must fail rather than
  // guess which account the password belongs to.
  const ambiguous = await request(app).post('/api/admin/login').send({ password: 'test-admin-pw' });
  assert.equal(ambiguous.status, 401);

  // But each admin can still log in by their own username.
  const first = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'test-admin-pw' });
  assert.equal(first.status, 200);
  const second = await request(app).post('/api/admin/login').send({ username: 'second.admin', password: 'anotherpassword1' });
  assert.equal(second.status, 200);
});

test('new admin accounts cannot be created through the site, even by the owner', async () => {
  const admin = await loginAsAdmin();
  const before = (await admin.get('/api/admin/admins')).body.admins.length;

  const res = await admin.post('/api/admin/admins').send({ username: 'sneaky.admin', password: 'longenough1', role: 'owner' });
  assert.equal(res.status, 404);

  assert.equal((await admin.get('/api/admin/admins')).body.admins.length, before);
  assert.equal((await request(app).post('/api/admin/login').send({ username: 'sneaky.admin', password: 'longenough1' })).status, 401);
});

test('an admin cannot delete their own account, and the last admin cannot be deleted', async () => {
  const admin = await loginAsAdmin();
  const before = await admin.get('/api/admin/admins');
  const selfId = before.body.admins.find((a) => a.username === 'admin').id;

  const deleteSelf = await admin.delete(`/api/admin/admins/${selfId}`);
  assert.equal(deleteSelf.status, 400);

  // Other tests in this file add their own admins, so clear everyone except
  // self first to get to a known "exactly one admin left" state.
  for (const other of before.body.admins.filter((a) => a.id !== selfId)) {
    await admin.delete(`/api/admin/admins/${other.id}`);
  }

  const deleteLast = await admin.delete(`/api/admin/admins/${selfId}`);
  assert.equal(deleteLast.status, 400);
});

test('an admin can change their own password, and it is required for their next login', async () => {
  // Uses a dedicated admin account (not the shared bootstrap admin other
  // tests in this file log in as) so changing its password here doesn't
  // affect any test that runs afterward.
  addAdmin(db, { username: 'pw.change', password: 'originalpassword1' });

  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'pw.change', password: 'originalpassword1' });
  const changed = await agent
    .post('/api/admin/change-password')
    .send({ currentPassword: 'originalpassword1', newPassword: 'brandnewadminpw1' });
  assert.equal(changed.status, 200);

  const oldLogin = await request(app).post('/api/admin/login').send({ username: 'pw.change', password: 'originalpassword1' });
  assert.equal(oldLogin.status, 401);

  const newLogin = await request(app).post('/api/admin/login').send({ username: 'pw.change', password: 'brandnewadminpw1' });
  assert.equal(newLogin.status, 200);
});

test('security actions are recorded in the audit log', async () => {
  const admin = await loginAsAdmin();
  await admin.post('/api/admin/students').send({ firstName: 'Aud', lastName: 'It', email: 'audit.me@kpis.ac.th', grade: '11' });

  const log = await admin.get('/api/admin/security/audit-log');
  assert.equal(log.status, 200);
  assert.ok(log.body.auditLog.some((entry) => entry.action === 'student.create' && entry.details.email === 'audit.me@kpis.ac.th'));
  assert.ok(log.body.auditLog.some((entry) => entry.action === 'admin.login'));
});

test('admin account endpoints require an admin session', async () => {
  assert.equal((await request(app).get('/api/admin/admins')).status, 401);
  assert.equal((await request(app).get('/api/admin/security/audit-log')).status, 401);
});
