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
  const res = await agent.post('/api/admin/login').send({ password: 'test-admin-pw' });
  assert.equal(res.status, 200);
  return agent;
}

test('admin login rejects the wrong password', async () => {
  const res = await request(app).post('/api/admin/login').send({ password: 'nope' });
  assert.equal(res.status, 401);
});

test('admin-only routes are blocked without an admin session', async () => {
  const res = await request(app).get('/api/admin/quick-links');
  assert.equal(res.status, 401);
});

test('quick links: create, edit, delete round trip', async () => {
  const admin = await loginAsAdmin();

  const created = await admin.post('/api/admin/quick-links').send({ label: 'Library', url: 'https://library.kpis.ac.th' });
  assert.equal(created.status, 201);
  const id = created.body.quickLink.id;

  const listed = await admin.get('/api/admin/quick-links');
  assert.ok(listed.body.quickLinks.some((q) => q.id === id));

  const edited = await admin.put(`/api/admin/quick-links/${id}`).send({ label: 'Library Portal', url: 'https://library.kpis.ac.th' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.quickLink.label, 'Library Portal');

  const deleted = await admin.delete(`/api/admin/quick-links/${id}`);
  assert.equal(deleted.status, 200);

  const listedAfter = await admin.get('/api/admin/quick-links');
  assert.ok(!listedAfter.body.quickLinks.some((q) => q.id === id));
});

test('quick links: rejects missing fields', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.post('/api/admin/quick-links').send({ label: '' });
  assert.equal(res.status, 400);
});

test('clubs: create with type, filter by type, then delete', async () => {
  const admin = await loginAsAdmin();

  const csClub = await admin.post('/api/admin/clubs').send({
    type: 'community-service',
    name: 'Beach Cleanup Crew',
    description: 'Monthly coastal cleanups.',
  });
  assert.equal(csClub.status, 201);

  const afterSchoolClub = await admin.post('/api/admin/clubs').send({
    type: 'after-school',
    name: 'Robotics Club',
    description: 'Build and compete with robots.',
    schedule: 'Tuesdays 3:30-5pm',
  });
  assert.equal(afterSchoolClub.status, 201);

  const csOnly = await admin.get('/api/admin/clubs?type=community-service');
  assert.ok(csOnly.body.clubs.some((c) => c.id === csClub.body.club.id));
  assert.ok(!csOnly.body.clubs.some((c) => c.id === afterSchoolClub.body.club.id));

  await admin.delete(`/api/admin/clubs/${csClub.body.club.id}`);
  await admin.delete(`/api/admin/clubs/${afterSchoolClub.body.club.id}`);
});

test('clubs: rejects an invalid type', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.post('/api/admin/clubs').send({ type: 'invalid', name: 'X', description: 'Y' });
  assert.equal(res.status, 400);
});

test('students: create, list, delete round trip', async () => {
  const admin = await loginAsAdmin();

  const created = await admin
    .post('/api/admin/students')
    .send({ firstName: 'Priya', lastName: 'Singh', email: 'priya.singh@kpis.ac.th', grade: '12' });
  assert.equal(created.status, 201);
  assert.equal(created.body.student.mustChangePassword, true);

  const duplicate = await admin
    .post('/api/admin/students')
    .send({ firstName: 'Priya', lastName: 'Singh', email: 'priya.singh@kpis.ac.th', grade: '12' });
  assert.equal(duplicate.status, 409);

  const badDomain = await admin
    .post('/api/admin/students')
    .send({ firstName: 'X', lastName: 'Y', email: 'x@gmail.com', grade: '12' });
  assert.equal(badDomain.status, 400);

  const listed = await admin.get('/api/admin/students');
  assert.ok(listed.body.students.some((s) => s.email === 'priya.singh@kpis.ac.th'));

  const deleted = await admin.delete(`/api/admin/students/${created.body.student.id}`);
  assert.equal(deleted.status, 200);
});
