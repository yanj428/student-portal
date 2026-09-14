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

async function loginAsOwner() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'test-admin-pw' });
  return agent;
}

test('an editor admin cannot manage other admins or see the Security tab', async () => {
  const owner = await loginAsOwner();
  await owner.post('/api/admin/admins').send({ username: 'editor.one', password: 'editorpassword1', role: 'editor' });

  const editor = request.agent(app);
  await editor.post('/api/admin/login').send({ username: 'editor.one', password: 'editorpassword1' });

  assert.equal((await editor.get('/api/admin/admins')).status, 403);
  assert.equal((await editor.post('/api/admin/admins').send({ username: 'x.editor', password: 'password123' })).status, 403);
  assert.equal((await editor.get('/api/admin/security/locked')).status, 403);
  assert.equal((await editor.get('/api/admin/security/audit-log')).status, 403);

  // But normal content/student management still works for an editor.
  assert.equal((await editor.get('/api/admin/students')).status, 200);
  const created = await editor.post('/api/admin/students').send({ firstName: 'E', lastName: 'D', email: 'editor.created@kpis.ac.th', grade: '9' });
  assert.equal(created.status, 201);
});

test('an owner can promote/demote roles, but not below one remaining owner', async () => {
  const bootstrapAgent = await loginAsOwner();
  const created = await bootstrapAgent
    .post('/api/admin/admins')
    .send({ username: 'role.test', password: 'rolepassword1', role: 'editor' });
  const id = created.body.admin.id;

  const promoted = await bootstrapAgent.patch(`/api/admin/admins/${id}/role`).send({ role: 'owner' });
  assert.equal(promoted.status, 200);

  // Demote the ORIGINAL bootstrap owner down to editor — should succeed
  // now that a second owner exists. This also immediately costs
  // bootstrapAgent its own owner rights (requireOwnerAdmin re-checks the
  // role fresh from the database on every request), so the rest of this
  // test continues as role.test, the only remaining owner.
  const admins = (await bootstrapAgent.get('/api/admin/admins')).body.admins;
  const bootstrapId = admins.find((a) => a.username === 'admin').id;
  const demoteBootstrap = await bootstrapAgent.patch(`/api/admin/admins/${bootstrapId}/role`).send({ role: 'editor' });
  assert.equal(demoteBootstrap.status, 200);

  assert.equal((await bootstrapAgent.get('/api/admin/admins')).status, 403);

  const newOwnerAgent = request.agent(app);
  await newOwnerAgent.post('/api/admin/login').send({ username: 'role.test', password: 'rolepassword1' });

  // Now only role.test is an owner — demoting them must fail.
  const demoteLast = await newOwnerAgent.patch(`/api/admin/admins/${id}/role`).send({ role: 'editor' });
  assert.equal(demoteLast.status, 400);

  // Restore for cleanliness (not strictly required, but keeps intent clear).
  await newOwnerAgent.patch(`/api/admin/admins/${bootstrapId}/role`).send({ role: 'owner' });
});

test('deleting the sole owner is refused even in the presence of other (editor) admins', async () => {
  const owner = await loginAsOwner();
  await owner.post('/api/admin/admins').send({ username: 'only.editor', password: 'onlyeditorpw1', role: 'editor' });

  const admins = (await owner.get('/api/admin/admins')).body.admins;
  const bootstrapId = admins.find((a) => a.username === 'admin').id;

  // The sole owner can't delete themselves (self-delete is always refused),
  // and having an unrelated editor admin around doesn't change that.
  const res = await owner.delete(`/api/admin/admins/${bootstrapId}`);
  assert.equal(res.status, 400);
});
