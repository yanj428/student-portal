const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

// Override the high limits initTestEnv() sets (so other test files' own
// request volume never trips them) with deliberately low ones just for
// this file, so we can actually exercise the limiter without sending
// hundreds of requests.
process.env.STUDENT_LOGIN_RATE_LIMIT = '3';
process.env.ADMIN_LOGIN_RATE_LIMIT = '3';

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('student login is rate-limited per IP regardless of which email is targeted', async () => {
  for (let i = 0; i < 3; i++) {
    const res = await request(app).post('/api/login').send({ email: `victim${i}@kpis.ac.th`, password: 'wrong' });
    assert.notEqual(res.status, 429);
  }
  const limited = await request(app).post('/api/login').send({ email: 'victim4@kpis.ac.th', password: 'wrong' });
  assert.equal(limited.status, 429);
});

test('admin login is rate-limited per IP', async () => {
  for (let i = 0; i < 3; i++) {
    const res = await request(app).post('/api/admin/login').send({ password: 'wrong' });
    assert.notEqual(res.status, 429);
  }
  const limited = await request(app).post('/api/admin/login').send({ password: 'wrong' });
  assert.equal(limited.status, 429);
});
