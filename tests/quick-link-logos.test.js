const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { UPLOADS_DIR, QUICK_LINK_LOGO_SUBDIR } = require('../server/uploads');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// The smallest valid PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: 'test-admin-pw' });
  return agent;
}

const fileOnDisk = (url) => path.join(UPLOADS_DIR, QUICK_LINK_LOGO_SUBDIR, path.basename(url));

test('a link can be added with a logo, and the logo shows in the list', async () => {
  const admin = await loginAsAdmin();
  const res = await admin
    .post('/api/admin/quick-links')
    .field('label', 'Canvas')
    .field('url', 'https://canvas.example.com')
    .attach('logo', PNG, 'logo.png');
  assert.equal(res.status, 201);
  assert.match(res.body.quickLink.logoUrl, /^\/uploads\/quick-link-logos\/.+\.png$/);
  assert.ok(fs.existsSync(fileOnDisk(res.body.quickLink.logoUrl)));
  const list = await admin.get('/api/admin/quick-links');
  assert.equal(list.body.quickLinks.at(-1).logoUrl, res.body.quickLink.logoUrl);
});

test('a link without a logo still works and has an empty logoUrl', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.post('/api/admin/quick-links').send({ label: 'Plain', url: 'https://plain.example.com' });
  assert.equal(res.status, 201);
  assert.equal(res.body.quickLink.logoUrl, '');
});

test('replacing and removing a logo deletes the old file', async () => {
  const admin = await loginAsAdmin();
  const made = await admin.post('/api/admin/quick-links').field('label', 'L').field('url', 'https://l.example.com').attach('logo', PNG, 'a.png');
  const first = made.body.quickLink.logoUrl;

  const replaced = await admin.put(`/api/admin/quick-links/${made.body.quickLink.id}`).field('label', 'L').field('url', 'https://l.example.com').attach('logo', PNG, 'b.png');
  assert.equal(replaced.status, 200);
  assert.notEqual(replaced.body.quickLink.logoUrl, first);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!fs.existsSync(fileOnDisk(first)), 'the old file is removed');

  const kept = await admin.put(`/api/admin/quick-links/${made.body.quickLink.id}`).field('label', 'L2').field('url', 'https://l.example.com');
  assert.equal(kept.body.quickLink.logoUrl, replaced.body.quickLink.logoUrl, 'editing without a file keeps the logo');

  const removed = await admin.put(`/api/admin/quick-links/${made.body.quickLink.id}`).field('label', 'L2').field('url', 'https://l.example.com').field('removeLogo', 'true');
  assert.equal(removed.body.quickLink.logoUrl, '');
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!fs.existsSync(fileOnDisk(replaced.body.quickLink.logoUrl)));
});

test('deleting a link deletes its logo file', async () => {
  const admin = await loginAsAdmin();
  const made = await admin.post('/api/admin/quick-links').field('label', 'D').field('url', 'https://d.example.com').attach('logo', PNG, 'd.png');
  const url = made.body.quickLink.logoUrl;
  assert.equal((await admin.delete(`/api/admin/quick-links/${made.body.quickLink.id}`)).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!fs.existsSync(fileOnDisk(url)));
});

test('a file that is not an image is refused and nothing is saved', async () => {
  const admin = await loginAsAdmin();
  const before = (await admin.get('/api/admin/quick-links')).body.quickLinks.length;
  const res = await admin.post('/api/admin/quick-links').field('label', 'Bad').field('url', 'https://bad.example.com').attach('logo', Buffer.from('<html>nope</html>'), 'x.png');
  assert.equal(res.status, 400);
  assert.equal((await admin.get('/api/admin/quick-links')).body.quickLinks.length, before);
});