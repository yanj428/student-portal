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

let counter = 0;

async function createStudent() {
  const email = `session.roles.${++counter}@kpis.ac.th`;
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const res = await admin.post('/api/admin/students').send({ firstName: 'Sam', lastName: 'Roles', email, grade: '10' });
  return { email, password: res.body.password };
}

// One agent is one browser: it keeps a single session cookie.
async function browserSignedInAsAdminAndStudent() {
  const { email, password } = await createStudent();
  const browser = request.agent(app);
  assert.equal((await browser.post('/api/admin/login').send({ password: 'test-admin-pw' })).status, 200);
  assert.equal((await browser.post('/api/login').send({ email, password })).status, 200);
  return browser;
}

test('signing in as a student on the same browser does not end the admin login', async () => {
  const browser = await browserSignedInAsAdminAndStudent();
  assert.equal((await browser.get('/api/admin/students')).status, 200);
  assert.equal((await browser.get('/api/me')).status, 200);
});

test('signing in as the admin on a browser with a student keeps the student signed in', async () => {
  const { email, password } = await createStudent();
  const browser = request.agent(app);
  await browser.post('/api/login').send({ email, password });
  await browser.post('/api/admin/login').send({ password: 'test-admin-pw' });
  assert.equal((await browser.get('/api/me')).status, 200);
  assert.equal((await browser.get('/api/admin/students')).status, 200);
});

test('a student logging out leaves the admin signed in', async () => {
  const browser = await browserSignedInAsAdminAndStudent();
  assert.equal((await browser.post('/api/logout')).status, 200);
  assert.equal((await browser.get('/api/me')).status, 401);
  assert.equal((await browser.get('/api/admin/students')).status, 200);
});

test('the admin logging out leaves the student signed in', async () => {
  const browser = await browserSignedInAsAdminAndStudent();
  assert.equal((await browser.post('/api/admin/logout')).status, 200);
  assert.equal((await browser.get('/api/admin/students')).status, 401);
  assert.equal((await browser.get('/api/me')).status, 200);
});

test('once both have logged out nobody is signed in', async () => {
  const browser = await browserSignedInAsAdminAndStudent();
  await browser.post('/api/logout');
  await browser.post('/api/admin/logout');
  assert.equal((await browser.get('/api/admin/students')).status, 401);
  assert.equal((await browser.get('/api/me')).status, 401);
});

test('an admin session is kept for a full day of inactivity, not an hour', async () => {
  const res = await request(app).post('/api/admin/login').send({ password: 'test-admin-pw' });
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('kpis.sid'));
  const expires = new Date(/Expires=([^;]+)/.exec(cookie)[1]).getTime();
  const hoursLeft = (expires - Date.now()) / 3600000;
  assert.ok(hoursLeft > 23 && hoursLeft <= 24.1, `expected about 24 hours, got ${hoursLeft.toFixed(1)}`);
});
