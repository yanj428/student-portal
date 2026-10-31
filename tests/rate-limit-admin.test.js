const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

// Deliberately low, just for this file — see rate-limit.test.js for why.
process.env.PASSWORD_CHANGE_RATE_LIMIT = '3';
process.env.CALENDAR_AI_RATE_LIMIT = '3';

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { addAdmin } = require('./helpers/admins');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'test-admin-pw' });
  return agent;
}

test('calendar AI extraction is rate-limited per admin', async () => {
  const admin = await loginAsAdmin();
  for (let i = 0; i < 3; i++) {
    const res = await admin.post('/api/admin/calendar-events/extract');
    assert.notEqual(res.status, 429);
  }
  const limited = await admin.post('/api/admin/calendar-events/extract');
  assert.equal(limited.status, 429);
});

test('guessing an admin password through change-password is rate-limited, same as for students', async () => {
  addAdmin(db, { username: 'limited.admin@kpis.ac.th', password: 'originalpassword1' });
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ username: 'limited.admin@kpis.ac.th', password: 'originalpassword1' });
  for (let i = 0; i < 3; i++) {
    const res = await admin.post('/api/admin/change-password').send({ currentPassword: 'wrong', newPassword: 'irrelevant-new-1' });
    assert.notEqual(res.status, 429);
  }
  const limited = await admin.post('/api/admin/change-password').send({ currentPassword: 'wrong', newPassword: 'irrelevant-new-1' });
  assert.equal(limited.status, 429);
});