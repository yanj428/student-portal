const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { UPLOADS_DIR, LUNCH_SUBDIR } = require('../server/uploads');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
// The smallest valid PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: 'test-admin-pw' });
  return agent;
}

const onDisk = (url) => path.join(UPLOADS_DIR, LUNCH_SUBDIR, path.basename(url));
const upload = (admin, buffer, name) => admin.post('/api/admin/lunch-image').field('weekLabel', 'Week 1').attach('image', buffer, name);

test('the lunch menu can be a PDF, and it is stored as a PDF', async () => {
  const admin = await loginAsAdmin();
  const res = await upload(admin, PDF, 'menu.pdf');
  assert.equal(res.status, 201);
  assert.match(res.body.lunchSchedule.imageUrl, /^\/uploads\/lunch\/.+\.pdf$/);
  assert.ok(fs.existsSync(onDisk(res.body.lunchSchedule.imageUrl)));
});

test('the PDF is served as a PDF that only our own pages may frame', async () => {
  const admin = await loginAsAdmin();
  const { body } = await upload(admin, PDF, 'menu.pdf');
  const served = await request(app).get(body.lunchSchedule.imageUrl);
  assert.equal(served.status, 200);
  assert.match(served.headers['content-type'], /application\/pdf/);
  assert.equal(served.headers['content-security-policy'], "frame-ancestors 'self'");

  const page = await request(app).get('/login');
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/, 'everything else still cannot be framed');
});

test('a file that only claims to be a PDF is refused', async () => {
  const admin = await loginAsAdmin();
  const before = db.readContent().lunchSchedule.imageUrl;
  const res = await upload(admin, Buffer.from('<html>not a pdf</html>'), 'menu.pdf');
  assert.equal(res.status, 400);
  assert.equal(db.readContent().lunchSchedule.imageUrl, before);
});

test('pictures still work, and replacing a PDF with one deletes the old PDF', async () => {
  const admin = await loginAsAdmin();
  const first = (await upload(admin, PDF, 'menu.pdf')).body.lunchSchedule.imageUrl;
  const second = await upload(admin, PNG, 'menu.png');
  assert.equal(second.status, 201);
  assert.match(second.body.lunchSchedule.imageUrl, /\.png$/);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!fs.existsSync(onDisk(first)), 'the old PDF is removed');
});

test('PDFs are only accepted for the lunch menu, not for club logos', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.post('/api/admin/clubs').field('type', 'after-school').field('name', 'PDF Club').attach('logo', PDF, 'logo.pdf');
  assert.equal(res.status, 400);
});