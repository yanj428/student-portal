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

const login = (agent, username, password) => agent.post('/api/admin/login').send({ username, password });

test('an admin made with a temporary password is told to choose their own, and nothing else opens until they do', async () => {
  addAdmin(db, { username: 'joel.gar@kpis.ac.th', password: 'joel.gar', mustChangePassword: true });
  const agent = request.agent(app);
  const signedIn = await login(agent, 'joel.gar@kpis.ac.th', 'joel.gar');
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.mustChangePassword, true);
  assert.equal((await agent.get('/api/admin/session')).body.mustChangePassword, true);

  const blocked = await agent.get('/api/admin/students');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.mustChangePassword, true);
  assert.equal((await agent.get('/api/admin/content')).status, 403);
  assert.equal((await agent.post('/api/admin/clubs').send({ type: 'after-school', name: 'Sneaky' })).status, 403);
});

test('choosing a new password opens the panel, and the temporary one stops working', async () => {
  addAdmin(db, { username: 'new.admin@kpis.ac.th', password: 'temporary-pass', mustChangePassword: true });
  const agent = request.agent(app);
  await login(agent, 'new.admin@kpis.ac.th', 'temporary-pass');

  const changed = await agent.post('/api/admin/change-password').send({ currentPassword: 'temporary-pass', newPassword: 'my-own-password-1' });
  assert.equal(changed.status, 200);
  assert.equal((await agent.get('/api/admin/session')).body.mustChangePassword, false);
  assert.equal((await agent.get('/api/admin/students')).status, 200, 'the session that made the change is now open');

  assert.equal((await login(request(app), 'new.admin@kpis.ac.th', 'temporary-pass')).status, 401);
  const again = await login(request(app), 'new.admin@kpis.ac.th', 'my-own-password-1');
  assert.equal(again.status, 200);
  assert.equal(again.body.mustChangePassword, false);
});

test('a new password must be a real change: long enough, not the old one, not the username, current one correct', async () => {
  addAdmin(db, { username: 'picky.admin@kpis.ac.th', password: 'temporary-pass', mustChangePassword: true });
  const agent = request.agent(app);
  await login(agent, 'picky.admin@kpis.ac.th', 'temporary-pass');
  const attempt = (currentPassword, newPassword) => agent.post('/api/admin/change-password').send({ currentPassword, newPassword });

  assert.equal((await attempt('temporary-pass', 'short')).status, 400);
  assert.equal((await attempt('temporary-pass', 'temporary-pass')).status, 400);
  assert.equal((await attempt('temporary-pass', 'picky.admin')).status, 400, 'not the username');
  assert.equal((await attempt('temporary-pass', 'PICKY.ADMIN@kpis.ac.th')).status, 400, 'not the full username either');
  assert.equal((await attempt('wrong-current', 'a-fine-new-password')).status, 401);
  assert.equal((await agent.get('/api/admin/students')).status, 403, 'still closed after all of those');
  assert.equal((await attempt('', '')).status, 400);
});

test("an admin's other sign-ins end when they change their own password", async () => {
  addAdmin(db, { username: 'two.sessions@kpis.ac.th', password: 'originalpassword1', mustChangePassword: false });
  const a = request.agent(app);
  const b = request.agent(app);
  await login(a, 'two.sessions@kpis.ac.th', 'originalpassword1');
  await login(b, 'two.sessions@kpis.ac.th', 'originalpassword1');
  assert.equal((await b.get('/api/admin/students')).status, 200);

  assert.equal((await a.post('/api/admin/change-password').send({ currentPassword: 'originalpassword1', newPassword: 'newpassword12' })).status, 200);
  assert.equal((await a.get('/api/admin/students')).status, 200);
  assert.equal((await b.get('/api/admin/students')).status, 401);
});

test('an admin who did not need to change their password is not asked to', async () => {
  addAdmin(db, { username: 'plain.admin@kpis.ac.th', password: 'plain-password-1' });
  const agent = request.agent(app);
  const res = await login(agent, 'plain.admin@kpis.ac.th', 'plain-password-1');
  assert.equal(res.body.mustChangePassword, false);
  assert.equal((await agent.get('/api/admin/students')).status, 200);
});

test('changing a password needs a signed-in admin', async () => {
  assert.equal((await request(app).post('/api/admin/change-password').send({ currentPassword: 'a', newPassword: 'bbbbbbbbb' })).status, 401);
});