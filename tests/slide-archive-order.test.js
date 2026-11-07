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

async function addSlide(admin, weekLabel) {
  const res = await admin.post('/api/admin/slide-archive').send({ weekLabel, canvaEmbedUrl: 'https://www.canva.com/design/DAFtest/view' });
  assert.equal(res.status, 201);
  return res.body.slide.id;
}

const labels = async (admin) => (await admin.get('/api/admin/slide-archive')).body.slides.map((s) => s.weekLabel);

test('a newly archived slide is added at the top of the list', async () => {
  const admin = await loginAsAdmin();
  await addSlide(admin, 'First');
  await addSlide(admin, 'Second');
  assert.deepEqual(await labels(admin), ['Second', 'First']);
});

test('the admin can rearrange archived slides and the new order sticks', async () => {
  const admin = await loginAsAdmin();
  const current = (await admin.get('/api/admin/slide-archive')).body.slides;
  const reversed = current.map((s) => s.id).reverse();

  const res = await admin.put('/api/admin/slide-archive/reorder').send({ orderedIds: reversed });
  assert.equal(res.status, 200);
  assert.deepEqual(await labels(admin), current.map((s) => s.weekLabel).reverse());
});

test('a reorder that leaves out, repeats or invents a slide is rejected and changes nothing', async () => {
  const admin = await loginAsAdmin();
  const before = await labels(admin);
  const ids = (await admin.get('/api/admin/slide-archive')).body.slides.map((s) => s.id);

  assert.equal((await admin.put('/api/admin/slide-archive/reorder').send({ orderedIds: ids.slice(1) })).status, 400);
  assert.equal((await admin.put('/api/admin/slide-archive/reorder').send({ orderedIds: [ids[0], ids[0]] })).status, 400);
  assert.equal((await admin.put('/api/admin/slide-archive/reorder').send({ orderedIds: [...ids.slice(1), 'not-a-real-id'] })).status, 400);
  assert.equal((await admin.put('/api/admin/slide-archive/reorder').send({ orderedIds: 'nope' })).status, 400);
  assert.deepEqual(await labels(admin), before);
});

test('data answers tell the browser not to keep a copy, so saved changes show up straight away', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.get('/api/admin/slide-archive');
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('reordering the archive requires an admin login', async () => {
  const res = await request(app).put('/api/admin/slide-archive/reorder').send({ orderedIds: [] });
  assert.equal(res.status, 401);
});

test('the admin can edit an archived slide and it keeps its place in the list', async () => {
  const admin = await loginAsAdmin();
  const id = await addSlide(admin, 'Typo wek');
  const before = await labels(admin);

  const res = await admin.put(`/api/admin/slide-archive/${id}`).send({ weekLabel: 'Fixed week', canvaEmbedUrl: 'https://www.canva.com/design/DAFnew/view' });
  assert.equal(res.status, 200);
  assert.equal(res.body.slide.weekLabel, 'Fixed week');

  const after = (await admin.get('/api/admin/slide-archive')).body.slides;
  assert.deepEqual(after.map((s) => s.weekLabel), before.map((l) => (l === 'Typo wek' ? 'Fixed week' : l)));
  assert.equal(after.find((s) => s.id === id).canvaEmbedUrl, 'https://www.canva.com/design/DAFnew/view');
});

test('editing an archived slide rejects a blank label, a non-Canva link and an unknown slide', async () => {
  const admin = await loginAsAdmin();
  const id = await addSlide(admin, 'Keep me');
  const good = 'https://www.canva.com/design/DAFtest/view';
  assert.equal((await admin.put(`/api/admin/slide-archive/${id}`).send({ weekLabel: ' ', canvaEmbedUrl: good })).status, 400);
  assert.equal((await admin.put(`/api/admin/slide-archive/${id}`).send({ weekLabel: 'x', canvaEmbedUrl: 'https://example.com/a' })).status, 400);
  assert.equal((await admin.put('/api/admin/slide-archive/nope').send({ weekLabel: 'x', canvaEmbedUrl: good })).status, 404);
  assert.ok((await labels(admin)).includes('Keep me'));
  assert.equal((await request(app).put(`/api/admin/slide-archive/${id}`).send({ weekLabel: 'x', canvaEmbedUrl: good })).status, 401);
});
