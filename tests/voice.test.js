const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

// Low, dedicated limits for this file so the rate-limit test doesn't need
// to send the real default of 5/20 requests to prove it works.
process.env.VOICE_POST_RATE_LIMIT = '2';
process.env.VOICE_REPLY_RATE_LIMIT = '2';

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function createLoggedInStudent(email) {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const created = await admin.post('/api/admin/students').send({ firstName: 'Vee', lastName: 'Oh', email, grade: '10' });
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password: created.body.password });
  return agent;
}

test('a student can post, and sees their own pending post but not other pending posts', async () => {
  const author = await createLoggedInStudent('voice.author@kpis.ac.th');
  const viewer = await createLoggedInStudent('voice.viewer@kpis.ac.th');

  const created = await author
    .post('/api/voice/posts')
    .send({ title: 'Test post', category: 'Suggestion', body: 'Please add more clubs.' });
  assert.equal(created.status, 201);
  assert.equal(created.body.post.status, 'pending');

  const ownFeed = await author.get('/api/voice/posts');
  assert.ok(ownFeed.body.posts.some((p) => p.id === created.body.post.id));

  const otherFeed = await viewer.get('/api/voice/posts');
  assert.ok(!otherFeed.body.posts.some((p) => p.id === created.body.post.id));
});

test('admin can approve a post, after which it is visible to everyone', async () => {
  const author = await createLoggedInStudent('voice.author2@kpis.ac.th');
  const viewer = await createLoggedInStudent('voice.viewer2@kpis.ac.th');

  const created = await author
    .post('/api/voice/posts')
    .send({ title: 'Approve me', category: 'Question', body: 'Is lunch at noon?' });

  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const approved = await admin.post(`/api/admin/voice/posts/${created.body.post.id}/approve`);
  assert.equal(approved.status, 200);

  const otherFeed = await viewer.get('/api/voice/posts');
  assert.ok(otherFeed.body.posts.some((p) => p.id === created.body.post.id));
});

test('rejects a title or message over the length limit', async () => {
  const author = await createLoggedInStudent('voice.longtext@kpis.ac.th');
  const tooLongBody = 'x'.repeat(2001);
  const res = await author.post('/api/voice/posts').send({ title: 'Fine', category: 'Other', body: tooLongBody });
  assert.equal(res.status, 400);
});

test('voice posting is rate-limited per student', async () => {
  const author = await createLoggedInStudent('voice.spammer@kpis.ac.th');
  for (let i = 0; i < 2; i++) {
    const res = await author.post('/api/voice/posts').send({ title: `Post ${i}`, category: 'Other', body: 'hi' });
    assert.notEqual(res.status, 429);
  }
  const limited = await author.post('/api/voice/posts').send({ title: 'Once more', category: 'Other', body: 'hi' });
  assert.equal(limited.status, 429);
});
