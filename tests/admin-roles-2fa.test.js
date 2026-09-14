const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { authenticator } = require('otplib');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function loginAsOwner() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email: 'admin@kpis.ac.th', password: 'test-admin-pw' });
  return agent;
}

// ---- Roles ----

test('an editor admin cannot manage other admins or see the Security tab', async () => {
  const owner = await loginAsOwner();
  await owner.post('/api/admin/admins').send({ email: 'editor.one@kpis.ac.th', password: 'editorpassword1', role: 'editor' });

  const editor = request.agent(app);
  await editor.post('/api/admin/login').send({ email: 'editor.one@kpis.ac.th', password: 'editorpassword1' });

  assert.equal((await editor.get('/api/admin/admins')).status, 403);
  assert.equal((await editor.post('/api/admin/admins').send({ email: 'x@kpis.ac.th', password: 'password123' })).status, 403);
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
    .send({ email: 'role.test@kpis.ac.th', password: 'rolepassword1', role: 'editor' });
  const id = created.body.admin.id;

  const promoted = await bootstrapAgent.patch(`/api/admin/admins/${id}/role`).send({ role: 'owner' });
  assert.equal(promoted.status, 200);

  // Demote the ORIGINAL bootstrap owner down to editor — should succeed
  // now that a second owner exists. This also immediately costs
  // bootstrapAgent its own owner rights (requireOwnerAdmin re-checks the
  // role fresh from the database on every request), so the rest of this
  // test continues as role.test, the only remaining owner.
  const admins = (await bootstrapAgent.get('/api/admin/admins')).body.admins;
  const bootstrapId = admins.find((a) => a.email === 'admin@kpis.ac.th').id;
  const demoteBootstrap = await bootstrapAgent.patch(`/api/admin/admins/${bootstrapId}/role`).send({ role: 'editor' });
  assert.equal(demoteBootstrap.status, 200);

  assert.equal((await bootstrapAgent.get('/api/admin/admins')).status, 403);

  const newOwnerAgent = request.agent(app);
  await newOwnerAgent.post('/api/admin/login').send({ email: 'role.test@kpis.ac.th', password: 'rolepassword1' });

  // Now only role.test@kpis.ac.th is an owner — demoting them must fail.
  const demoteLast = await newOwnerAgent.patch(`/api/admin/admins/${id}/role`).send({ role: 'editor' });
  assert.equal(demoteLast.status, 400);

  // Restore for cleanliness (not strictly required, but keeps intent clear).
  await newOwnerAgent.patch(`/api/admin/admins/${bootstrapId}/role`).send({ role: 'owner' });
});

test('deleting the sole owner is refused even in the presence of other (editor) admins', async () => {
  const owner = await loginAsOwner();
  await owner.post('/api/admin/admins').send({ email: 'only.editor@kpis.ac.th', password: 'onlyeditorpw1', role: 'editor' });

  const admins = (await owner.get('/api/admin/admins')).body.admins;
  const bootstrapId = admins.find((a) => a.email === 'admin@kpis.ac.th').id;

  // The sole owner can't delete themselves (self-delete is always refused),
  // and having an unrelated editor admin around doesn't change that.
  const res = await owner.delete(`/api/admin/admins/${bootstrapId}`);
  assert.equal(res.status, 400);
});

// ---- Two-factor authentication ----

async function enableTotpFor(agent) {
  const setup = await agent.post('/api/admin/2fa/setup');
  assert.equal(setup.status, 200);
  const code = authenticator.generate(setup.body.secret);
  const enabled = await agent.post('/api/admin/2fa/enable').send({ code });
  assert.equal(enabled.status, 200);
  return { secret: setup.body.secret, recoveryCodes: enabled.body.recoveryCodes };
}

test('enabling 2FA requires a valid code, and login then requires a TOTP step', async () => {
  const owner = await loginAsOwner();
  await owner.post('/api/admin/admins').send({ email: 'twofa.user@kpis.ac.th', password: 'twofapassword1' });

  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email: 'twofa.user@kpis.ac.th', password: 'twofapassword1' });

  const setup = await agent.post('/api/admin/2fa/setup');
  assert.equal(setup.status, 200);
  assert.ok(setup.body.secret);
  assert.ok(setup.body.otpauthUrl.startsWith('otpauth://totp/'));

  const badEnable = await agent.post('/api/admin/2fa/enable').send({ code: '000000' });
  assert.equal(badEnable.status, 400);

  const goodCode = authenticator.generate(setup.body.secret);
  const enabled = await agent.post('/api/admin/2fa/enable').send({ code: goodCode });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.recoveryCodes.length, 8);

  // A brand new login now stops at the password step.
  const fresh = request.agent(app);
  const step1 = await fresh.post('/api/admin/login').send({ email: 'twofa.user@kpis.ac.th', password: 'twofapassword1' });
  assert.equal(step1.status, 200);
  assert.equal(step1.body.requiresTotp, true);
  assert.equal((await fresh.get('/api/admin/students')).status, 401); // not logged in yet

  const step2 = await fresh.post('/api/admin/login/verify-totp').send({ code: authenticator.generate(setup.body.secret) });
  assert.equal(step2.status, 200);
  assert.equal((await fresh.get('/api/admin/students')).status, 200);
});

test('a recovery code can complete login once, then never again', async () => {
  const owner = await loginAsOwner();
  await owner.post('/api/admin/admins').send({ email: 'recovery.user@kpis.ac.th', password: 'recoverypassword1' });
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email: 'recovery.user@kpis.ac.th', password: 'recoverypassword1' });
  const { recoveryCodes } = await enableTotpFor(agent);

  const login1 = request.agent(app);
  await login1.post('/api/admin/login').send({ email: 'recovery.user@kpis.ac.th', password: 'recoverypassword1' });
  const useCode = await login1.post('/api/admin/login/verify-totp').send({ recoveryCode: recoveryCodes[0] });
  assert.equal(useCode.status, 200);

  const login2 = request.agent(app);
  await login2.post('/api/admin/login').send({ email: 'recovery.user@kpis.ac.th', password: 'recoverypassword1' });
  const reuseCode = await login2.post('/api/admin/login/verify-totp').send({ recoveryCode: recoveryCodes[0] });
  assert.equal(reuseCode.status, 401);
});

test('disabling 2FA requires the current password, and removes the TOTP requirement at login', async () => {
  const owner = await loginAsOwner();
  await owner.post('/api/admin/admins').send({ email: 'disable.user@kpis.ac.th', password: 'disablepassword1' });
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email: 'disable.user@kpis.ac.th', password: 'disablepassword1' });
  await enableTotpFor(agent);

  const badDisable = await agent.post('/api/admin/2fa/disable').send({ password: 'wrong-password' });
  assert.equal(badDisable.status, 401);

  const disabled = await agent.post('/api/admin/2fa/disable').send({ password: 'disablepassword1' });
  assert.equal(disabled.status, 200);

  const fresh = request.agent(app);
  const login = await fresh.post('/api/admin/login').send({ email: 'disable.user@kpis.ac.th', password: 'disablepassword1' });
  assert.equal(login.status, 200);
  assert.equal(login.body.requiresTotp, undefined);
});

test('repeated wrong TOTP codes lock out the account, just like repeated wrong passwords', async () => {
  const owner = await loginAsOwner();
  await owner.post('/api/admin/admins').send({ email: 'totp.lockout@kpis.ac.th', password: 'totplockoutpw1' });
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email: 'totp.lockout@kpis.ac.th', password: 'totplockoutpw1' });
  await enableTotpFor(agent);

  const fresh = request.agent(app);
  await fresh.post('/api/admin/login').send({ email: 'totp.lockout@kpis.ac.th', password: 'totplockoutpw1' });

  let lastRes;
  for (let i = 0; i < 5; i++) {
    lastRes = await fresh.post('/api/admin/login/verify-totp').send({ code: '000000' });
  }
  assert.equal(lastRes.status, 403);
  assert.equal(lastRes.body.locked, true);
});
