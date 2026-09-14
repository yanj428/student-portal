const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

// Low, dedicated limit for this file so the rate-limit test doesn't need
// to send the real default of 5 requests to prove it works — but high
// enough that the lists test below (three posts from one author) doesn't
// trip it by accident.
process.env.VOICE_POST_RATE_LIMIT = '4';

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

async function createLoggedInStudent(email) {
  const admin = await loginAsAdmin();
  const created = await admin.post('/api/admin/students').send({ firstName: 'Vee', lastName: 'Oh', email, grade: '10' });
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password: created.body.password });
  // A new account is created with mustChangePassword: true, and content
  // routes now correctly refuse that until it's changed — so change it
  // here to get a normal "active" student for these Voice tests.
  await agent.post('/api/change-password').send({ currentPassword: created.body.password, newPassword: 'activepassword1' });
  return agent;
}

test('a student can post, and only they (not another student) can see it', async () => {
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

test('approving a suggestion never makes it visible to other students — only StuCo (admin) and the author see it', async () => {
  const author = await createLoggedInStudent('voice.author2@kpis.ac.th');
  const viewer = await createLoggedInStudent('voice.viewer2@kpis.ac.th');

  const created = await author
    .post('/api/voice/posts')
    .send({ title: 'Approve me', category: 'Question', body: 'Is lunch at noon?' });

  const admin = await loginAsAdmin();
  const approved = await admin.post(`/api/admin/voice/posts/${created.body.post.id}/approve`);
  assert.equal(approved.status, 200);

  const authorFeed = await author.get('/api/voice/posts');
  const mine = authorFeed.body.posts.find((p) => p.id === created.body.post.id);
  assert.ok(mine);
  assert.equal(mine.status, 'approved');

  const otherFeed = await viewer.get('/api/voice/posts');
  assert.ok(!otherFeed.body.posts.some((p) => p.id === created.body.post.id));

  const adminList = await admin.get('/api/admin/voice/approved');
  assert.ok(adminList.body.items.some((i) => i.id === created.body.post.id));
});

test('rejecting a suggestion keeps it (status: rejected) instead of deleting it, and StuCo can approve it later', async () => {
  const author = await createLoggedInStudent('voice.rejectme@kpis.ac.th');
  const created = await author
    .post('/api/voice/posts')
    .send({ title: 'Reject me', category: 'Other', body: 'This one gets rejected.' });

  const admin = await loginAsAdmin();
  const rejected = await admin.post(`/api/admin/voice/posts/${created.body.post.id}/reject`);
  assert.equal(rejected.status, 200);

  const authorFeed = await author.get('/api/voice/posts');
  const mine = authorFeed.body.posts.find((p) => p.id === created.body.post.id);
  assert.ok(mine, 'rejected post should still exist for its author, not be deleted');
  assert.equal(mine.status, 'rejected');

  const rejectedList = await admin.get('/api/admin/voice/rejected');
  assert.ok(rejectedList.body.items.some((i) => i.id === created.body.post.id));

  // StuCo can change their mind.
  const reApproved = await admin.post(`/api/admin/voice/posts/${created.body.post.id}/approve`);
  assert.equal(reApproved.status, 200);
  const approvedList = await admin.get('/api/admin/voice/approved');
  assert.ok(approvedList.body.items.some((i) => i.id === created.body.post.id));
});

test('the admin pending/approved/rejected lists only ever contain matching-status items', async () => {
  const author = await createLoggedInStudent('voice.lists@kpis.ac.th');
  const admin = await loginAsAdmin();

  const a = await author.post('/api/voice/posts').send({ title: 'A', category: 'Other', body: 'stays pending' });
  const b = await author.post('/api/voice/posts').send({ title: 'B', category: 'Other', body: 'gets approved' });
  const c = await author.post('/api/voice/posts').send({ title: 'C', category: 'Other', body: 'gets rejected' });
  await admin.post(`/api/admin/voice/posts/${b.body.post.id}/approve`);
  await admin.post(`/api/admin/voice/posts/${c.body.post.id}/reject`);

  const pending = (await admin.get('/api/admin/voice/pending')).body.items;
  const approved = (await admin.get('/api/admin/voice/approved')).body.items;
  const rejected = (await admin.get('/api/admin/voice/rejected')).body.items;

  assert.ok(pending.some((i) => i.id === a.body.post.id));
  assert.ok(!pending.some((i) => i.id === b.body.post.id) && !pending.some((i) => i.id === c.body.post.id));
  assert.ok(approved.some((i) => i.id === b.body.post.id) && !approved.some((i) => i.id === c.body.post.id));
  assert.ok(rejected.some((i) => i.id === c.body.post.id) && !rejected.some((i) => i.id === b.body.post.id));
});

test('a student can edit their own suggestion, which sends it back to pending', async () => {
  const author = await createLoggedInStudent('voice.editor@kpis.ac.th');
  const other = await createLoggedInStudent('voice.editor.other@kpis.ac.th');
  const admin = await loginAsAdmin();

  const created = await author.post('/api/voice/posts').send({ title: 'Original', category: 'Other', body: 'v1' });
  await admin.post(`/api/admin/voice/posts/${created.body.post.id}/approve`);

  const edited = await author
    .patch(`/api/voice/posts/${created.body.post.id}`)
    .send({ title: 'Updated', category: 'Suggestion', body: 'v2' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.post.title, 'Updated');
  assert.equal(edited.body.post.status, 'pending', 'editing an approved suggestion sends it back for review');

  const otherEdit = await other
    .patch(`/api/voice/posts/${created.body.post.id}`)
    .send({ title: 'Hijacked', category: 'Other', body: 'nope' });
  assert.equal(otherEdit.status, 404, "a student can't edit another student's suggestion");
});

test('a student can delete their own suggestion, but not another student\'s', async () => {
  const author = await createLoggedInStudent('voice.deleter@kpis.ac.th');
  const other = await createLoggedInStudent('voice.deleter.other@kpis.ac.th');

  const created = await author.post('/api/voice/posts').send({ title: 'Delete me', category: 'Other', body: 'x' });

  const otherDelete = await other.delete(`/api/voice/posts/${created.body.post.id}`);
  assert.equal(otherDelete.status, 404);

  const ownDelete = await author.delete(`/api/voice/posts/${created.body.post.id}`);
  assert.equal(ownDelete.status, 200);

  const feed = await author.get('/api/voice/posts');
  assert.ok(!feed.body.posts.some((p) => p.id === created.body.post.id));
});

test('an admin can permanently delete any suggestion regardless of status', async () => {
  const author = await createLoggedInStudent('voice.admindelete@kpis.ac.th');
  const admin = await loginAsAdmin();

  const created = await author.post('/api/voice/posts').send({ title: 'Remove me', category: 'Other', body: 'x' });
  await admin.post(`/api/admin/voice/posts/${created.body.post.id}/approve`);

  const del = await admin.delete(`/api/admin/voice/posts/${created.body.post.id}`);
  assert.equal(del.status, 200);

  const approvedList = await admin.get('/api/admin/voice/approved');
  assert.ok(!approvedList.body.items.some((i) => i.id === created.body.post.id));

  const authorFeed = await author.get('/api/voice/posts');
  assert.ok(!authorFeed.body.posts.some((p) => p.id === created.body.post.id));
});

test('rejects a title or message over the length limit', async () => {
  const author = await createLoggedInStudent('voice.longtext@kpis.ac.th');
  const tooLongBody = 'x'.repeat(2001);
  const res = await author.post('/api/voice/posts').send({ title: 'Fine', category: 'Other', body: tooLongBody });
  assert.equal(res.status, 400);
});

test('voice posting is rate-limited per student', async () => {
  const author = await createLoggedInStudent('voice.spammer@kpis.ac.th');
  for (let i = 0; i < 4; i++) {
    const res = await author.post('/api/voice/posts').send({ title: `Post ${i}`, category: 'Other', body: 'hi' });
    assert.notEqual(res.status, 429);
  }
  const limited = await author.post('/api/voice/posts').send({ title: 'Once more', category: 'Other', body: 'hi' });
  assert.equal(limited.status, 429);
});
