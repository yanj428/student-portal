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

async function signedInStudent() {
  const admin = await loginAsAdmin();
  const email = `res.student.${Date.now()}@kpis.ac.th`;
  const created = await admin.post('/api/admin/students').send({ firstName: 'Re', lastName: 'Source', email, grade: '10' });
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password: created.body.password });
  await agent.post('/api/change-password').send({ currentPassword: created.body.password, newPassword: 'a-brand-new-pw-1' });
  return agent;
}

const titles = async (admin) => (await admin.get('/api/admin/cs-resources')).body.resources.map((r) => r.title);

test('the five links that used to be typed into the page are there to start with, in order', async () => {
  const admin = await loginAsAdmin();
  assert.deepEqual(await titles(admin), [
    'Community Service Guidelines',
    'Process Slides Summary',
    'Proposal Form Template',
    'Project Report Template',
    'Submit Your Proposal or Project',
  ]);
});

test('students see the same list', async () => {
  const student = await signedInStudent();
  const res = await student.get('/api/cs-resources');
  assert.equal(res.status, 200);
  assert.equal(res.body.resources.length, 5);
  assert.match(res.body.resources[0].url, /^https:\/\//);
});

test('an admin can add, edit, reorder and remove a resource', async () => {
  const admin = await loginAsAdmin();

  const added = await admin.post('/api/admin/cs-resources').send({ title: 'Volunteer hours log', url: 'https://example.com/log' });
  assert.equal(added.status, 201);
  const id = added.body.resource.id;
  assert.equal((await titles(admin)).at(-1), 'Volunteer hours log');

  const edited = await admin.put(`/api/admin/cs-resources/${id}`).send({ title: 'Hours log (new)', url: 'https://example.com/log2' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.resource.url, 'https://example.com/log2');

  const ids = (await admin.get('/api/admin/cs-resources')).body.resources.map((r) => r.id);
  const reversed = [...ids].reverse();
  assert.equal((await admin.put('/api/admin/cs-resources/reorder').send({ orderedIds: reversed })).status, 200);
  assert.equal((await titles(admin))[0], 'Hours log (new)');

  assert.equal((await admin.delete(`/api/admin/cs-resources/${id}`)).status, 200);
  assert.ok(!(await titles(admin)).includes('Hours log (new)'));
});

test('bad input is refused', async () => {
  const admin = await loginAsAdmin();
  const before = await titles(admin);
  const bad = [
    { title: '', url: 'https://example.com' },
    { title: 'No link', url: '' },
    { title: 'x'.repeat(151), url: 'https://example.com' },
    { title: 'Script', url: 'javascript:alert(1)' },
    { title: 'Not a link', url: 'just some words' },
  ];
  for (const body of bad) {
    assert.equal((await admin.post('/api/admin/cs-resources').send(body)).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(await titles(admin), before);

  const ids = (await admin.get('/api/admin/cs-resources')).body.resources.map((r) => r.id);
  assert.equal((await admin.put('/api/admin/cs-resources/reorder').send({ orderedIds: ids.slice(1) })).status, 400);
  assert.equal((await admin.put('/api/admin/cs-resources/nope').send({ title: 'x', url: 'https://example.com' })).status, 404);
  assert.equal((await admin.delete('/api/admin/cs-resources/nope')).status, 404);
});

test('only admins can change resources, and only signed-in students can read them', async () => {
  const student = await signedInStudent();
  assert.equal((await request(app).get('/api/cs-resources')).status, 401);
  assert.equal((await request(app).post('/api/admin/cs-resources').send({ title: 'x', url: 'https://example.com' })).status, 401);
  assert.equal((await student.post('/api/admin/cs-resources').send({ title: 'x', url: 'https://example.com' })).status, 401);
  assert.equal((await student.delete('/api/admin/cs-resources/anything')).status, 401);
});

test('the Community Service page no longer has the links typed into it', async () => {
  const student = await signedInStudent();
  const html = (await student.get('/community-service')).text;
  assert.match(html, /id="cs-resources-list"/);
  assert.ok(!html.includes('Proposal Form Template'), 'the links come from the list now');
});

test('emptying the list is respected: the starting links are only added once', () => {
  assert.ok(db.rawConnection.prepare("SELECT 1 FROM app_flags WHERE name = 'csResourcesDefaults'").get());
  db.writeCsResources([]);
  assert.equal(db.readCsResources().length, 0);
});
