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

// Uses the bootstrap admin's email explicitly (rather than relying on the
// single-admin fallback) since several tests in this file add a second
// admin, which would otherwise make later bare-password logins ambiguous.
async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email: 'admin@kpis.ac.th', password: 'test-admin-pw' });
  return agent;
}

test('the bootstrap admin exists and can log in by email too, not just the single-admin fallback', async () => {
  const res = await request(app).post('/api/admin/login').send({ email: 'admin@kpis.ac.th', password: 'test-admin-pw' });
  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'admin@kpis.ac.th');
});

test('a wrong email with the right password is rejected', async () => {
  const res = await request(app).post('/api/admin/login').send({ email: 'nobody@kpis.ac.th', password: 'test-admin-pw' });
  assert.equal(res.status, 401);
});

test('adding a second admin requires email to disambiguate at login', async () => {
  const admin = await loginAsAdmin();
  const created = await admin.post('/api/admin/admins').send({ email: 'second.admin@kpis.ac.th', password: 'anotherpassword1' });
  assert.equal(created.status, 201);

  // With two admins now, omitting email at login must fail rather than
  // guess which account the password belongs to.
  const ambiguous = await request(app).post('/api/admin/login').send({ password: 'test-admin-pw' });
  assert.equal(ambiguous.status, 401);

  // But each admin can still log in by their own email.
  const first = await request(app).post('/api/admin/login').send({ email: 'admin@kpis.ac.th', password: 'test-admin-pw' });
  assert.equal(first.status, 200);
  const second = await request(app).post('/api/admin/login').send({ email: 'second.admin@kpis.ac.th', password: 'anotherpassword1' });
  assert.equal(second.status, 200);
});

test('rejects creating a duplicate admin email and a too-short password', async () => {
  const admin = await loginAsAdmin();
  const dup = await admin.post('/api/admin/admins').send({ email: 'admin@kpis.ac.th', password: 'longenough1' });
  assert.equal(dup.status, 409);

  const shortPw = await admin.post('/api/admin/admins').send({ email: 'third.admin@kpis.ac.th', password: 'short' });
  assert.equal(shortPw.status, 400);
});

test('an admin cannot delete their own account, and the last admin cannot be deleted', async () => {
  const admin = await loginAsAdmin();
  const before = await admin.get('/api/admin/admins');
  const selfId = before.body.admins.find((a) => a.email === 'admin@kpis.ac.th').id;

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
  const bootstrapAdmin = await loginAsAdmin();
  await bootstrapAdmin.post('/api/admin/admins').send({ email: 'pw.change@kpis.ac.th', password: 'originalpassword1' });

  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email: 'pw.change@kpis.ac.th', password: 'originalpassword1' });
  const changed = await agent
    .post('/api/admin/change-password')
    .send({ currentPassword: 'originalpassword1', newPassword: 'brandnewadminpw1' });
  assert.equal(changed.status, 200);

  const oldLogin = await request(app).post('/api/admin/login').send({ email: 'pw.change@kpis.ac.th', password: 'originalpassword1' });
  assert.equal(oldLogin.status, 401);

  const newLogin = await request(app).post('/api/admin/login').send({ email: 'pw.change@kpis.ac.th', password: 'brandnewadminpw1' });
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
  assert.equal((await request(app).post('/api/admin/admins').send({ email: 'x@kpis.ac.th', password: 'password123' })).status, 401);
  assert.equal((await request(app).get('/api/admin/security/audit-log')).status, 401);
});
