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

const club = (extra = {}) => ({ type: 'after-school', name: 'Chess Club', ...extra });

test('an after school club keeps its meeting day and time', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.post('/api/admin/clubs').field('type', 'after-school').field('name', 'Chess Club').field('meetingDay', ' Tue & Thu ').field('meetingTime', '3:30-5:00 PM').field('schedule', 'STEM Lab');
  assert.equal(res.status, 201);
  assert.equal(res.body.club.meetingDay, 'Tue & Thu');
  assert.equal(res.body.club.meetingTime, '3:30-5:00 PM');
  assert.equal(res.body.club.schedule, 'STEM Lab');
  const listed = (await admin.get('/api/admin/clubs?type=after-school')).body.clubs.find((c) => c.name === 'Chess Club');
  assert.equal(listed.meetingDay, 'Tue & Thu');
});

test('a club without them has empty values, and they can be edited and cleared', async () => {
  const admin = await loginAsAdmin();
  const made = await admin.post('/api/admin/clubs').send(club({ name: 'Plain Club' }));
  assert.equal(made.body.club.meetingDay, '');
  assert.equal(made.body.club.meetingTime, '');

  const set = await admin.put(`/api/admin/clubs/${made.body.club.id}`).send(club({ name: 'Plain Club', meetingDay: 'Monday', meetingTime: '4 PM' }));
  assert.equal(set.body.club.meetingDay, 'Monday');
  const cleared = await admin.put(`/api/admin/clubs/${made.body.club.id}`).send(club({ name: 'Plain Club' }));
  assert.equal(cleared.body.club.meetingDay, '');
  assert.equal(cleared.body.club.meetingTime, '');
});

test('too-long or non-text values are refused', async () => {
  const admin = await loginAsAdmin();
  assert.equal((await admin.post('/api/admin/clubs').send(club({ meetingDay: 'x'.repeat(101) }))).status, 400);
  assert.equal((await admin.post('/api/admin/clubs').send(club({ meetingTime: 'x'.repeat(101) }))).status, 400);
  assert.equal((await admin.post('/api/admin/clubs').send(club({ meetingDay: 5 }))).status, 400);
});