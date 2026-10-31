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

async function signedInStudent() {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const email = `events.${Date.now()}@kpis.ac.th`;
  const made = await admin.post('/api/admin/students').send({ firstName: 'Ev', lastName: 'Ents', email, grade: 'Grade 10' });
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password: made.body.password });
  await agent.post('/api/change-password').send({ currentPassword: made.body.password, newPassword: 'a-brand-new-pw-1' });
  return agent;
}

test('the Upcoming Events page needs a signed-in student', async () => {
  const res = await request(app).get('/upcoming-events');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /login/);
});

test('the Upcoming Events page is a calendar, it is in the menu, and Announcements no longer has one', async () => {
  const student = await signedInStudent();
  const page = await student.get('/upcoming-events');
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>Upcoming Events<\/h1>/);
  assert.match(page.text, /id="cal-grid"/);
  assert.match(page.text, /class="nav-item active" data-page="upcoming-events"/);

  const announcements = await student.get('/announcements');
  assert.ok(!announcements.text.includes('id="cal-grid"'), 'the calendar moved off Announcements');
  assert.match(announcements.text, /href="\/upcoming-events"/, 'but the menu links to it');
});

test('the home page "See calendar" link goes to the Upcoming Events page', async () => {
  const student = await signedInStudent();
  assert.match((await student.get('/')).text, /<a href="\/upcoming-events" class="home-more">See calendar<\/a>/);
});