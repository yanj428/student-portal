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

test('an address the site does not have shows the page-not-found screen with a 404 status', async () => {
  const res = await request(app).get('/this-page-does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.text, /We can't find that page/);
  assert.match(res.text, /href="\/"/);
});

test('an unknown API address still answers with short JSON, not a web page', async () => {
  const res = await request(app).get('/api/nothing-here');
  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.deepEqual(res.body, { error: 'Not found.' });
});

test('an unknown address on a POST answers with JSON', async () => {
  const res = await request(app).post('/nothing-here').send({});
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Not found.' });
});
